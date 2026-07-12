#!/usr/bin/env python3
"""Capture README screenshots from a local Jellyfin via Chromium CDP."""
from __future__ import annotations

import base64
import json
import os
import re
import socket
import struct
import time
import urllib.request
from pathlib import Path

BASE = os.environ.get("JF_URL", "http://localhost:8096")
TOKEN = os.environ.get("JF_TOKEN", "")
USER = os.environ.get("JF_USER", "")
SERVER = os.environ.get("JF_SERVER", "")

if not TOKEN or not USER or not SERVER:
    raise SystemExit(
        "Set JF_TOKEN, JF_USER, and JF_SERVER (and optionally JF_URL). "
        "Example: export JF_TOKEN=… JF_USER=… JF_SERVER=…"
    )

OUT = Path(__file__).resolve().parents[1] / "docs" / "screenshots"
PORT = int(os.environ.get("CDP_PORT", "9333"))


class RawWS:
    def __init__(self, ws_url: str) -> None:
        m = re.match(r"ws://([^:/]+):(\d+)(/.*)", ws_url)
        if not m:
            raise ValueError(ws_url)
        host, port, path = m.group(1), int(m.group(2)), m.group(3)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\n"
            f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n\r\n"
        ).encode()
        self.sock = socket.create_connection((host, port), timeout=60)
        self.sock.sendall(req)
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += self.sock.recv(4096)
        self.id = 0
        self._buf = b""

    def _recv_frame(self) -> bytes:
        while True:
            while len(self._buf) < 2:
                chunk = self.sock.recv(65536)
                if not chunk:
                    raise ConnectionError("closed")
                self._buf += chunk
            b1, b2 = self._buf[0], self._buf[1]
            opcode = b1 & 0x0F
            masked = b2 & 0x80
            length = b2 & 0x7F
            idx = 2
            if length == 126:
                while len(self._buf) < 4:
                    self._buf += self.sock.recv(65536)
                length = struct.unpack("!H", self._buf[2:4])[0]
                idx = 4
            elif length == 127:
                while len(self._buf) < 10:
                    self._buf += self.sock.recv(65536)
                length = struct.unpack("!Q", self._buf[2:10])[0]
                idx = 10
            mask = b""
            if masked:
                while len(self._buf) < idx + 4:
                    self._buf += self.sock.recv(65536)
                mask = self._buf[idx : idx + 4]
                idx += 4
            while len(self._buf) < idx + length:
                self._buf += self.sock.recv(65536)
            payload = self._buf[idx : idx + length]
            self._buf = self._buf[idx + length :]
            if masked:
                payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
            if opcode == 0x8:
                raise ConnectionError("ws close")
            if opcode == 0x9:
                self._send_frame(0xA, payload)
                continue
            if opcode in (0x1, 0x2):
                return payload

    def _send_frame(self, opcode: int, payload: bytes | str) -> None:
        if not isinstance(payload, (bytes, bytearray)):
            payload = payload.encode()
        mask_key = os.urandom(4)
        header = bytearray([0x80 | opcode])
        n = len(payload)
        if n < 126:
            header.append(0x80 | n)
        elif n < 65536:
            header.append(0x80 | 126)
            header.extend(struct.pack("!H", n))
        else:
            header.append(0x80 | 127)
            header.extend(struct.pack("!Q", n))
        header.extend(mask_key)
        masked = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(header + masked)

    def call(self, method: str, params=None, timeout: float = 90):
        self.id += 1
        msg = {"id": self.id, "method": method}
        if params is not None:
            msg["params"] = params
        self._send_frame(0x1, json.dumps(msg))
        deadline = time.time() + timeout
        while time.time() < deadline:
            data = json.loads(self._recv_frame())
            if data.get("id") == self.id:
                if "error" in data:
                    raise RuntimeError(data["error"])
                return data.get("result", {})
        raise TimeoutError(method)

    def close(self) -> None:
        try:
            self.sock.close()
        except Exception:
            pass


def api_get(path: str):
    req = urllib.request.Request(
        f"{BASE}{path}",
        headers={"Authorization": f'MediaBrowser Token="{TOKEN}"'},
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version") as r:
        browser_ws = json.load(r)["webSocketDebuggerUrl"]
    bcdp = RawWS(browser_ws)
    target_id = bcdp.call("Target.createTarget", {"url": "about:blank"})["targetId"]
    bcdp.close()
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list") as r:
        pages = json.load(r)
    page = next(p for p in pages if p.get("id") == target_id)
    cdp = RawWS(page["webSocketDebuggerUrl"])
    cdp.call("Page.enable")
    cdp.call("Runtime.enable")
    cdp.call(
        "Emulation.setDeviceMetricsOverride",
        {"width": 1440, "height": 900, "deviceScaleFactor": 1, "mobile": False},
    )

    creds = json.dumps(
        {
            "Servers": [
                {
                    "DateLastAccessed": int(time.time() * 1000),
                    "LastConnectionMode": 2,
                    "ManualAddress": BASE,
                    "manualAddressOnly": True,
                    "Name": "Jellyfin-Docker",
                    "Id": SERVER,
                    "LocalAddress": BASE,
                    "AccessToken": TOKEN,
                    "UserId": USER,
                }
            ]
        }
    )
    boot = (
        f"localStorage.setItem('jellyfin_credentials', {json.dumps(creds)}); "
        f"localStorage.setItem('_deviceId2','shot-device'); "
        f"localStorage.setItem('{USER}-appTheme','dark'); "
        f"localStorage.setItem('{USER}-disableCustomCss','false');"
    )
    cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source": boot})
    cdp.call("Page.navigate", {"url": f"{BASE}/web/index.html#/home"})
    time.sleep(5)

    def shot(name: str, url: str | None = None, wait: float = 3, before: str | None = None) -> None:
        if url:
            cdp.call("Page.navigate", {"url": url})
            time.sleep(wait)
        if before:
            cdp.call("Runtime.evaluate", {"expression": before})
            time.sleep(1.3)
        res = cdp.call("Page.captureScreenshot", {"format": "png", "fromSurface": True}, timeout=60)
        data = base64.b64decode(res["data"])
        (OUT / name).write_bytes(data)
        print(f"wrote {name} ({len(data) // 1024} KB)", flush=True)

    shot("01-home.png", f"{BASE}/web/index.html#/home", wait=8)

    views = api_get(f"/Users/{USER}/Views")["Items"]
    movies = next(v for v in views if v.get("CollectionType") == "movies")
    shows = next((v for v in views if v.get("CollectionType") == "tvshows"), None)
    shot(
        "02-library-movies.png",
        f"{BASE}/web/index.html#!/movies.html?topParentId={movies['Id']}",
        wait=5,
    )

    detail = api_get(
        f"/Users/{USER}/Items?SearchTerm=In%20the%20Mood%20for%20Love"
        f"&Limit=1&Recursive=true&IncludeItemTypes=Movie"
    )["Items"][0]
    shot(
        "03-detail.png",
        f"{BASE}/web/index.html#/details?id={detail['Id']}&serverId={SERVER}",
        wait=5,
    )

    shot("04-settings.png", f"{BASE}/web/index.html#!/settings.html", wait=4)
    shot("04b-display.png", f"{BASE}/web/index.html#!/mypreferencesdisplay.html", wait=4)

    shot(
        "05-drawer.png",
        f"{BASE}/web/index.html#/home",
        wait=5,
        before=(
            "(() => { const b = document.querySelector('button.mainDrawerButton') || "
            "[...document.querySelectorAll('button')].find(x => (x.getAttribute('title')||'')==='Menu'); "
            "if (b) b.click(); return !!b; })()"
        ),
    )

    resume = api_get(f"/Users/{USER}/Items/Resume?Limit=1&MediaTypes=Video")["Items"]
    play = resume[0] if resume else detail
    shot(
        "06-ready-play.png",
        f"{BASE}/web/index.html#/details?id={play['Id']}&serverId={SERVER}",
        wait=4,
    )
    cdp.call(
        "Runtime.evaluate",
        {
            "expression": (
                "(() => { const b = [...document.querySelectorAll('button')]"
                ".find(x => /^\\s*Play\\s*$/i.test(x.textContent||'')); "
                "if (b) b.click(); return !!b; })()"
            )
        },
    )
    time.sleep(8)
    cdp.call(
        "Runtime.evaluate",
        {
            "expression": (
                "document.dispatchEvent(new MouseEvent('mousemove',"
                "{clientX:720,clientY:450,bubbles:true})); true;"
            )
        },
    )
    time.sleep(1.5)
    shot("06-player-osd.png")

    shot("07-search.png", f"{BASE}/web/index.html#!/search.html", wait=4)
    if shows:
        shot(
            "08-library-shows.png",
            f"{BASE}/web/index.html#!/list.html?parentId={shows['Id']}",
            wait=5,
        )
    shot(
        "09-home-scrolled.png",
        f"{BASE}/web/index.html#/home",
        wait=6,
        before="window.scrollTo(0, 780); true;",
    )
    cdp.close()
    print("done", sorted(p.name for p in OUT.glob("*.png")), flush=True)


if __name__ == "__main__":
    main()
