#!/usr/bin/env bash
# Install liquid-glass theme into a running linuxserver/jellyfin container.
#
# - Custom CSS  → branding.xml (server-wide theme)
# - Lens JS     → /usr/share/jellyfin/web/ui/osd-lens-glass.js + index.html link
# - Persist     → /config/liquid-glass + custom-cont-init.d hook
#
# The WebGL lens MUST be a real <script> tag. Jellyfin injects CustomCss as
# text inside a React <style> node, so the </style><script> breakout in CSS
# never executes.
#
# The script URL always includes ?v=refraction-<hash> so browsers don't keep
# a stale lens after menu / home navigations (SPA reuses index.html).
#
# Usage:
#   ./tools/install-into-docker.sh
#   CONTAINER=jellyfin ./tools/install-into-docker.sh

set -euo pipefail

CONTAINER="${CONTAINER:-jellyfin}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CSS_SRC="${ROOT}/style.css"
JS_SRC="${ROOT}/tools/osd-lens-glass.js"
ACCENT_SRC="${ROOT}/tools/poster-accent.js"
HOOK_SRC="${ROOT}/tools/99-liquid-glass-lens.sh"
LENS_CACHE_BUST="${LENS_CACHE_BUST:-refraction}"

log() { echo "**** [liquid-glass] $* ****"; }

lens_cache_bust() {
  local hash
  hash="$(sha256sum "$JS_SRC" | awk '{print substr($1,1,8)}')"
  printf '%s-%s' "$LENS_CACHE_BUST" "$hash"
}

write_branding_css() {
  local branding="$1"
  local css_file="$2"
  python3 - "$branding" "$css_file" <<'PY'
import html
import sys
from pathlib import Path

branding_path = Path(sys.argv[1])
css = Path(sys.argv[2]).read_text(encoding="utf-8")
escaped = html.escape(css)

if branding_path.exists():
    text = branding_path.read_text(encoding="utf-8")
else:
    text = """<?xml version="1.0" encoding="utf-8"?>
<BrandingOptions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <LoginDisclaimer />
  <CustomCss></CustomCss>
  <SplashscreenEnabled>true</SplashscreenEnabled>
</BrandingOptions>
"""

start = text.find("<CustomCss>")
end = text.find("</CustomCss>")
if start < 0 or end < 0:
    raise SystemExit("branding.xml missing <CustomCss> tags")

start += len("<CustomCss>")
branding_path.write_text(text[:start] + escaped + text[end:], encoding="utf-8")
print(f"Wrote CustomCss ({len(css)} bytes) → {branding_path}")
PY
}

upsert_ui_script_tags() {
  local lens_bust="$1"
  local accent_bust="$2"
  local tmp
  tmp="$(mktemp)"
  docker cp "${CONTAINER}:/usr/share/jellyfin/web/index.html" "$tmp"
  docker exec "$CONTAINER" sh -c '
    INDEX=/usr/share/jellyfin/web/index.html
    [ -f "${INDEX}.bak.liquid-glass" ] || cp -f "$INDEX" "${INDEX}.bak.liquid-glass"
  ' || true
  python3 - "$tmp" "$lens_bust" "$accent_bust" <<'PY'
import re
import sys
from pathlib import Path

index = Path(sys.argv[1])
scripts = [
    ("osd-lens-glass.js", sys.argv[2]),
    ("poster-accent.js", sys.argv[3]),
]
text = index.read_text(encoding="utf-8", errors="replace")
tags = []
for name, bust in scripts:
    tag = f'<script src="ui/{name}?v={bust}" defer></script>'
    tags.append(tag)
    pat = re.compile(
        rf'[ \t]*<script[^>]*src=["\'][^"\']*{re.escape(name)}[^"\']*["\'][^>]*>\s*</script>\s*',
        re.I,
    )
    if pat.search(text):
        text = pat.sub(tag + "\n", text, count=1)
    elif re.search(r"(?i)</body>", text):
        text = re.sub(r"(?i)</body>", tag + "\n</body>", text, count=1)
    else:
        text = text.rstrip() + "\n" + tag + "\n"
index.write_text(text, encoding="utf-8")
print("\n".join(tags))
PY
  docker cp "$tmp" "${CONTAINER}:/usr/share/jellyfin/web/index.html"
  rm -f "$tmp"
}

install_persist_hook() {
  local dest="$1"
  cp -f "$HOOK_SRC" "$dest"
  chmod +x "$dest"
  log "Wrote persist hook: ${dest}"
}

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  log "ERROR: container '${CONTAINER}' is not running"
  exit 1
fi

[[ -f "$JS_SRC" ]] || { log "ERROR: missing $JS_SRC"; exit 1; }
[[ -f "$ACCENT_SRC" ]] || { log "ERROR: missing $ACCENT_SRC"; exit 1; }
[[ -f "$CSS_SRC" ]] || { log "ERROR: missing $CSS_SRC"; exit 1; }
[[ -f "$HOOK_SRC" ]] || { log "ERROR: missing $HOOK_SRC"; exit 1; }

BUST="$(lens_cache_bust)"
ACCENT_BUST="accent-$(sha256sum "$ACCENT_SRC" | awk '{print substr($1,1,8)}')"
log "Installing into Docker container: ${CONTAINER} (cache-bust=${BUST}, accent=${ACCENT_BUST})"

CONFIG_SRC="$(docker inspect "$CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/config"}}{{.Source}}{{end}}{{end}}')"
INIT_SRC="$(docker inspect "$CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/custom-cont-init.d"}}{{.Source}}{{end}}{{end}}')"

if [[ -n "$CONFIG_SRC" && -f "${CONFIG_SRC}/branding.xml" ]]; then
  write_branding_css "${CONFIG_SRC}/branding.xml" "$CSS_SRC"
else
  log "WARNING: could not locate host branding.xml — CSS not updated"
fi

docker exec "$CONTAINER" mkdir -p /usr/share/jellyfin/web/ui
docker cp "$JS_SRC" "${CONTAINER}:/usr/share/jellyfin/web/ui/osd-lens-glass.js"
docker cp "$ACCENT_SRC" "${CONTAINER}:/usr/share/jellyfin/web/ui/poster-accent.js"

if [[ -n "$CONFIG_SRC" ]]; then
  mkdir -p "${CONFIG_SRC}/liquid-glass"
  cp -f "$JS_SRC" "${CONFIG_SRC}/liquid-glass/osd-lens-glass.js"
  cp -f "$ACCENT_SRC" "${CONFIG_SRC}/liquid-glass/poster-accent.js"
  printf '%s\n' "$BUST" > "${CONFIG_SRC}/liquid-glass/cache-bust.txt"
  printf '%s\n' "$ACCENT_BUST" > "${CONFIG_SRC}/liquid-glass/accent-bust.txt"
fi

upsert_ui_script_tags "$BUST" "$ACCENT_BUST"
log "Installed + linked /web/ui/osd-lens-glass.js?v=${BUST}"
log "Installed + linked /web/ui/poster-accent.js?v=${ACCENT_BUST}"

if [[ -n "$CONFIG_SRC" ]]; then
  if [[ -d "${CONFIG_SRC}/custom-cont-init.d" ]]; then
    install_persist_hook "${CONFIG_SRC}/custom-cont-init.d/99-liquid-glass-lens.sh"
  fi
  if [[ -n "$INIT_SRC" && -d "$INIT_SRC" && "$INIT_SRC" != "${CONFIG_SRC}/custom-cont-init.d" ]]; then
    if install_persist_hook "${INIT_SRC}/99-liquid-glass-lens.sh" 2>/dev/null; then
      :
    else
      docker cp "$HOOK_SRC" "${CONTAINER}:/custom-cont-init.d/99-liquid-glass-lens.sh"
      docker exec -u root "$CONTAINER" chmod +x /custom-cont-init.d/99-liquid-glass-lens.sh
      log "Wrote persist hook via docker: /custom-cont-init.d/99-liquid-glass-lens.sh"
    fi
  fi
else
  log "WARNING: no /config mount — lens will need reinstall after image updates"
fi

code="$(curl -sS -o /dev/null -w '%{http_code}' 'http://127.0.0.1:8096/web/ui/osd-lens-glass.js' || true)"
log "HTTP /web/ui/osd-lens-glass.js → ${code}"
accent_code="$(curl -sS -o /dev/null -w '%{http_code}' 'http://127.0.0.1:8096/web/ui/poster-accent.js' || true)"
log "HTTP /web/ui/poster-accent.js → ${accent_code}"
if curl -sS 'http://127.0.0.1:8096/web/index.html' | grep -q "osd-lens-glass.js?v=${BUST}"; then
  log "index.html references osd-lens-glass.js?v=${BUST}"
elif curl -sS 'http://127.0.0.1:8096/web/index.html' | grep -q 'osd-lens-glass.js'; then
  log "WARNING: index.html has osd-lens-glass.js but wrong/missing ?v= cache-bust"
else
  log "WARNING: index.html does not reference osd-lens-glass.js"
fi
if curl -sS 'http://127.0.0.1:8096/web/index.html' | grep -q "poster-accent.js?v=${ACCENT_BUST}"; then
  log "index.html references poster-accent.js?v=${ACCENT_BUST}"
else
  log "WARNING: index.html does not reference poster-accent.js?v=${ACCENT_BUST}"
fi

log "Done. Hard-refresh Jellyfin (Ctrl+Shift+R) and play a video."
log "Look for '[osd-lens-glass] loaded' in the browser console."
