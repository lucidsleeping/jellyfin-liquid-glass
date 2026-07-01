# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is
This repository is **not a runnable application**. It is a single, static **Jellyfin
Custom CSS theme** (`style.css`, ~4000 lines) plus one authoring tool
(`tools/generate-liquid-glass.py`). There is no `package.json`, no build system, no
lint config, and no automated test suite. "Building" the product just means editing
`style.css`; there is nothing to compile.

Note: `README.md` refers to the theme file as `jellyfin-liquid-glass.css`, but the
actual file in the repo is `style.css`. They are the same file — use `style.css`.

### Generator tool (the only runnable code)
`tools/generate-liquid-glass.py` bakes a refraction displacement-map PNG into a
base64 CSS data URL and prints `--liquid-scale` / `--liquid-disp-url` tokens to
stdout (it does not write any file). It requires **Pillow**, which the update script
installs.

```bash
python3 tools/generate-liquid-glass.py
```

### End-to-end visual testing (recommended for theme changes)
The only meaningful end-to-end test is to render `style.css` inside a live Jellyfin
web UI. Jellyfin itself is an external host app and is intentionally **not** part of
the update script. To test:

1. Ensure Docker is available and the daemon is running. In this VM there is **no
   systemd**, so start the daemon manually (needs `fuse-overlayfs` storage driver and
   `iptables-legacy`, both already configured if Docker was installed here):
   `sudo dockerd &` (or run it in a tmux session).
2. Run Jellyfin: `sudo docker run -d --name jellyfin -p 8096:8096 jellyfin/jellyfin:latest`.
   Web UI is at `http://localhost:8096/web/`.
3. Complete the first-run wizard, then apply the theme. The fastest way to apply
   `style.css` without hand-pasting 150KB into the browser is the server branding API:
   authenticate as the admin user, then `POST /System/Configuration/branding` with a
   JSON body `{"CustomCss": "<contents of style.css>"}`. Jellyfin then serves it at
   `/Branding/Css.css` and injects it into the web client. (Equivalent manual path:
   Dashboard → General → Custom CSS, or User → Settings → Display → Custom CSS, then
   hard-refresh.)
4. Verify the dark translucent glass surfaces and Apple-blue (`#0a84ff`) accents render
   across login, home, settings, and the video player OSD.

### Requirements the theme targets
Jellyfin 10.9+ and a browser supporting `backdrop-filter`, `:has()`, and
`animation-timeline`.
