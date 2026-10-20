#!/usr/bin/env bash
# Install one Jellyfin theme into a running linuxserver/jellyfin container.
#
# THEME=liquid (default)
#   Custom CSS → style.css
#   Lens JS    → /usr/share/jellyfin/web/ui/osd-lens-glass.js
#
# THEME=cyberpunk-liquid
#   Custom CSS → style-cyberpunk-liquid.css
#   Lens JS    → /usr/share/jellyfin/web/ui/osd-lens-cyberpunk.js
#
# THEME=cyberpunk
#   Custom CSS → style-cyberpunk.css
#   Lens JS    → none (both lens tags are removed)
#
# The installer injects only the matching lens <script>, not both.
# poster-accent.js is installed with liquid and cyberpunk-liquid.
# THEME=cyberpunk does not inject a lens or poster-accent.js.
# Persist → /config/liquid-glass + custom-cont-init.d hook.
#
# The WebGL lens MUST be a real <script> tag. Jellyfin injects CustomCss as
# text inside a React <style> node, so the </style><script> breakout in CSS
# never executes.
#
# The script URL always includes ?v=<prefix>-<hash> so browsers don't keep
# a stale lens after menu / home navigations (SPA reuses index.html).
#   liquid            → ?v=refraction-<hash>
#   cyberpunk-liquid  → ?v=spectral-<hash>
#
# Usage:
#   ./tools/install-into-docker.sh
#   THEME=cyberpunk-liquid ./tools/install-into-docker.sh
#   THEME=cyberpunk ./tools/install-into-docker.sh
#   CONTAINER=jellyfin THEME=liquid ./tools/install-into-docker.sh

set -euo pipefail

CONTAINER="${CONTAINER:-jellyfin}"
THEME="${THEME:-liquid}"
NO_LENS=0
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ACCENT_SRC="${ROOT}/tools/poster-accent.js"
HOOK_SRC="${ROOT}/tools/99-liquid-glass-lens.sh"

log() { echo "**** [liquid-glass] $* ****"; }

case "$THEME" in
  liquid)
    CSS_SRC="${ROOT}/style.css"
    JS_SRC="${ROOT}/tools/osd-lens-glass.js"
    LENS_FILE="osd-lens-glass.js"
    OTHER_LENS_FILE="osd-lens-cyberpunk.js"
    LENS_CACHE_BUST="${LENS_CACHE_BUST:-refraction}"
    CONSOLE_PREFIX="[osd-lens-glass]"
    ;;
  cyberpunk-liquid)
    CSS_SRC="${ROOT}/style-cyberpunk-liquid.css"
    JS_SRC="${ROOT}/tools/osd-lens-cyberpunk.js"
    LENS_FILE="osd-lens-cyberpunk.js"
    OTHER_LENS_FILE="osd-lens-glass.js"
    LENS_CACHE_BUST="${LENS_CACHE_BUST:-spectral}"
    CONSOLE_PREFIX="[osd-lens-cyberpunk]"
    ;;
  cyberpunk)
    CSS_SRC="${ROOT}/style-cyberpunk.css"
    JS_SRC=""
    LENS_FILE=""
    OTHER_LENS_FILE=""
    LENS_CACHE_BUST=""
    CONSOLE_PREFIX=""
    NO_LENS=1
    ;;
  *)
    log "ERROR: THEME must be liquid, cyberpunk-liquid, or cyberpunk (got '${THEME}')"
    exit 1
    ;;
esac

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
  local lens_file="$1"
  local lens_bust="$2"
  local accent_bust="$3"
  local other_lens="$4"
  local tmp
  tmp="$(mktemp)"
  docker cp "${CONTAINER}:/usr/share/jellyfin/web/index.html" "$tmp"
  docker exec "$CONTAINER" sh -c '
    INDEX=/usr/share/jellyfin/web/index.html
    [ -f "${INDEX}.bak.liquid-glass" ] || cp -f "$INDEX" "${INDEX}.bak.liquid-glass"
  ' || true
  python3 - "$tmp" "$lens_file" "$lens_bust" "$accent_bust" "$other_lens" <<'PY'
import re
import sys
from pathlib import Path

index = Path(sys.argv[1])
lens_file = sys.argv[2]
lens_bust = sys.argv[3]
accent_bust = sys.argv[4]
other_lens = sys.argv[5]
text = index.read_text(encoding="utf-8", errors="replace")

def script_pat(name):
    return re.compile(
        rf'[ \t]*<script[^>]*src=["\'][^"\']*{re.escape(name)}[^"\']*["\'][^>]*>\s*</script>\s*',
        re.I,
    )

def insert_before_body(html, tag):
    if re.search(r"(?i)</body>", html):
        return re.sub(r"(?i)</body>", tag + "\n</body>", html, count=1)
    return html.rstrip() + "\n" + tag + "\n"

# Pure cyberpunk: CSS only. Strip every lens and the poster accent.
if not lens_file:
    for name in ("osd-lens-glass.js", "osd-lens-cyberpunk.js", "poster-accent.js"):
        text = script_pat(name).sub("", text)
    index.write_text(text, encoding="utf-8")
    print("no-lens")
    raise SystemExit(0)

# Drop the lens that does not match this theme. Never link both.
if other_lens:
    text = script_pat(other_lens).sub("", text)

scripts = [
    (lens_file, lens_bust),
    ("poster-accent.js", accent_bust),
]
tags = []
for name, bust in scripts:
    tag = f'<script src="ui/{name}?v={bust}" defer></script>'
    tags.append(tag)
    text = script_pat(name).sub("", text)
    text = insert_before_body(text, tag)

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

if [[ "$NO_LENS" != "1" ]]; then
  [[ -f "$JS_SRC" ]] || { log "ERROR: missing $JS_SRC"; exit 1; }
  [[ -f "$ACCENT_SRC" ]] || { log "ERROR: missing $ACCENT_SRC"; exit 1; }
fi
[[ -f "$CSS_SRC" ]] || { log "ERROR: missing $CSS_SRC"; exit 1; }
[[ -f "$HOOK_SRC" ]] || { log "ERROR: missing $HOOK_SRC"; exit 1; }

if [[ "$NO_LENS" == "1" ]]; then
  BUST=""
  ACCENT_BUST=""
  log "THEME=${THEME}"
  log "Installing into Docker container: ${CONTAINER} (no lens)"
else
  BUST="$(lens_cache_bust)"
  ACCENT_BUST="accent-$(sha256sum "$ACCENT_SRC" | awk '{print substr($1,1,8)}')"
  log "THEME=${THEME}"
  log "Installing into Docker container: ${CONTAINER} (lens=${LENS_FILE}, cache-bust=${BUST}, accent=${ACCENT_BUST})"
fi

CONFIG_SRC="$(docker inspect "$CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/config"}}{{.Source}}{{end}}{{end}}')"
INIT_SRC="$(docker inspect "$CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/custom-cont-init.d"}}{{.Source}}{{end}}{{end}}')"

if [[ -n "$CONFIG_SRC" && -f "${CONFIG_SRC}/branding.xml" ]]; then
  write_branding_css "${CONFIG_SRC}/branding.xml" "$CSS_SRC"
else
  log "WARNING: could not locate host branding.xml — CSS not updated"
fi

docker exec "$CONTAINER" mkdir -p /usr/share/jellyfin/web/ui
if [[ "$NO_LENS" == "1" ]]; then
  docker exec "$CONTAINER" rm -f \
    /usr/share/jellyfin/web/ui/osd-lens-glass.js \
    /usr/share/jellyfin/web/ui/osd-lens-cyberpunk.js \
    /usr/share/jellyfin/web/ui/poster-accent.js
else
  docker cp "$JS_SRC" "${CONTAINER}:/usr/share/jellyfin/web/ui/${LENS_FILE}"
  docker exec "$CONTAINER" rm -f "/usr/share/jellyfin/web/ui/${OTHER_LENS_FILE}"
  docker cp "$ACCENT_SRC" "${CONTAINER}:/usr/share/jellyfin/web/ui/poster-accent.js"
fi

if [[ -n "$CONFIG_SRC" ]]; then
  mkdir -p "${CONFIG_SRC}/liquid-glass"
  if [[ "$NO_LENS" == "1" ]]; then
    rm -f \
      "${CONFIG_SRC}/liquid-glass/osd-lens-glass.js" \
      "${CONFIG_SRC}/liquid-glass/osd-lens-cyberpunk.js" \
      "${CONFIG_SRC}/liquid-glass/poster-accent.js"
    printf '%s\n' "none" > "${CONFIG_SRC}/liquid-glass/cache-bust.txt"
    printf '%s\n' "none" > "${CONFIG_SRC}/liquid-glass/accent-bust.txt"
  else
    cp -f "$JS_SRC" "${CONFIG_SRC}/liquid-glass/${LENS_FILE}"
    rm -f "${CONFIG_SRC}/liquid-glass/${OTHER_LENS_FILE}"
    cp -f "$ACCENT_SRC" "${CONFIG_SRC}/liquid-glass/poster-accent.js"
    printf '%s\n' "$BUST" > "${CONFIG_SRC}/liquid-glass/cache-bust.txt"
    printf '%s\n' "$ACCENT_BUST" > "${CONFIG_SRC}/liquid-glass/accent-bust.txt"
  fi
  printf '%s\n' "$THEME" > "${CONFIG_SRC}/liquid-glass/theme.txt"
fi

if [[ "$NO_LENS" == "1" ]]; then
  upsert_ui_script_tags "" "" "" ""
  log "Removed lens and poster-accent script tags"
else
  upsert_ui_script_tags "$LENS_FILE" "$BUST" "$ACCENT_BUST" "$OTHER_LENS_FILE"
  log "Installed + linked /web/ui/${LENS_FILE}?v=${BUST}"
  log "Installed + linked /web/ui/poster-accent.js?v=${ACCENT_BUST}"
  log "Did not link /web/ui/${OTHER_LENS_FILE}"
fi

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

if [[ "$NO_LENS" == "1" ]]; then
  if curl -sS 'http://127.0.0.1:8096/web/index.html' | grep -Eq 'osd-lens-glass\.js|osd-lens-cyberpunk\.js'; then
    log "WARNING: index.html still references a lens script"
  else
    log "index.html has no lens script"
  fi
else
  code="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:8096/web/ui/${LENS_FILE}" || true)"
  log "HTTP /web/ui/${LENS_FILE} → ${code}"
  accent_code="$(curl -sS -o /dev/null -w '%{http_code}' 'http://127.0.0.1:8096/web/ui/poster-accent.js' || true)"
  log "HTTP /web/ui/poster-accent.js → ${accent_code}"
  if curl -sS 'http://127.0.0.1:8096/web/index.html' | grep -q "${LENS_FILE}?v=${BUST}"; then
    log "index.html references ${LENS_FILE}?v=${BUST}"
  elif curl -sS 'http://127.0.0.1:8096/web/index.html' | grep -q "${LENS_FILE}"; then
    log "WARNING: index.html has ${LENS_FILE} but wrong/missing ?v= cache-bust"
  else
    log "WARNING: index.html does not reference ${LENS_FILE}"
  fi
  if curl -sS 'http://127.0.0.1:8096/web/index.html' | grep -q "${OTHER_LENS_FILE}"; then
    log "WARNING: index.html still references ${OTHER_LENS_FILE} (both lenses must not load)"
  fi
  if curl -sS 'http://127.0.0.1:8096/web/index.html' | grep -q "poster-accent.js?v=${ACCENT_BUST}"; then
    log "index.html references poster-accent.js?v=${ACCENT_BUST}"
  else
    log "WARNING: index.html does not reference poster-accent.js?v=${ACCENT_BUST}"
  fi
fi

log "Done. Hard-refresh Jellyfin (Ctrl+Shift+R)."
if [[ "$NO_LENS" == "1" ]]; then
  log "THEME=cyberpunk serves CSS only. No WebGL lens."
else
  log "Look for '${CONSOLE_PREFIX} loaded' in the browser console."
fi
