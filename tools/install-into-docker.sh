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
#   Palette JS → /usr/share/jellyfin/web/ui/cyberpunk-palette.js
#
# The installer injects only the matching lens <script>, not both.
# poster-accent.js is installed with liquid and cyberpunk-liquid.
# THEME=cyberpunk does not inject a lens or poster-accent.js.
# It does inject cyberpunk-palette.js?v=palette-<hash>. Liquid themes do not.
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
PALETTE_SRC="${ROOT}/tools/cyberpunk-palette.js"
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
  local palette_file="${5:-}"
  local palette_bust="${6:-}"
  local tmp
  tmp="$(mktemp)"
  docker cp "${CONTAINER}:/usr/share/jellyfin/web/index.html" "$tmp"
  docker exec "$CONTAINER" sh -c '
    INDEX=/usr/share/jellyfin/web/index.html
    [ -f "${INDEX}.bak.liquid-glass" ] || cp -f "$INDEX" "${INDEX}.bak.liquid-glass"
  ' || true
  python3 - "$tmp" "$lens_file" "$lens_bust" "$accent_bust" "$other_lens" "$palette_file" "$palette_bust" <<'PY'
import re
import sys
from pathlib import Path

index = Path(sys.argv[1])
lens_file = sys.argv[2]
lens_bust = sys.argv[3]
accent_bust = sys.argv[4]
other_lens = sys.argv[5]
palette_file = sys.argv[6] if len(sys.argv) > 6 else ""
palette_bust = sys.argv[7] if len(sys.argv) > 7 else ""
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

def finish_palette(html):
    html = script_pat("cyberpunk-palette.js").sub("", html)
    if palette_file:
        tag = f'<script src="ui/{palette_file}?v={palette_bust}" defer></script>'
        html = insert_before_body(html, tag)
        print(tag)
    return html

# Pure cyberpunk: no lens. Palette script only.
if not lens_file:
    for name in ("osd-lens-glass.js", "osd-lens-cyberpunk.js", "poster-accent.js"):
        text = script_pat(name).sub("", text)
    text = finish_palette(text)
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

text = finish_palette(text)
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
  [[ -f "$PALETTE_SRC" ]] || { log "ERROR: missing $PALETTE_SRC"; exit 1; }
  BUST=""
  ACCENT_BUST=""
  PALETTE_BUST="palette-$(sha256sum "$PALETTE_SRC" | awk '{print substr($1,1,8)}')"
  log "THEME=${THEME}"
  log "Installing into Docker container: ${CONTAINER} (no lens, palette=${PALETTE_BUST})"
else
  PALETTE_BUST=""
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
  docker cp "$PALETTE_SRC" "${CONTAINER}:/usr/share/jellyfin/web/ui/cyberpunk-palette.js"
else
  docker cp "$JS_SRC" "${CONTAINER}:/usr/share/jellyfin/web/ui/${LENS_FILE}"
  docker exec "$CONTAINER" rm -f \
    "/usr/share/jellyfin/web/ui/${OTHER_LENS_FILE}" \
    /usr/share/jellyfin/web/ui/cyberpunk-palette.js
  docker cp "$ACCENT_SRC" "${CONTAINER}:/usr/share/jellyfin/web/ui/poster-accent.js"
fi

if [[ -n "$CONFIG_SRC" ]]; then
  mkdir -p "${CONFIG_SRC}/liquid-glass"
  if [[ "$NO_LENS" == "1" ]]; then
    rm -f \
      "${CONFIG_SRC}/liquid-glass/osd-lens-glass.js" \
      "${CONFIG_SRC}/liquid-glass/osd-lens-cyberpunk.js" \
      "${CONFIG_SRC}/liquid-glass/poster-accent.js"
    cp -f "$PALETTE_SRC" "${CONFIG_SRC}/liquid-glass/cyberpunk-palette.js"
    printf '%s\n' "none" > "${CONFIG_SRC}/liquid-glass/cache-bust.txt"
    printf '%s\n' "none" > "${CONFIG_SRC}/liquid-glass/accent-bust.txt"
    printf '%s\n' "$PALETTE_BUST" > "${CONFIG_SRC}/liquid-glass/palette-bust.txt"
  else
    cp -f "$JS_SRC" "${CONFIG_SRC}/liquid-glass/${LENS_FILE}"
    rm -f \
      "${CONFIG_SRC}/liquid-glass/${OTHER_LENS_FILE}" \
      "${CONFIG_SRC}/liquid-glass/cyberpunk-palette.js"
    cp -f "$ACCENT_SRC" "${CONFIG_SRC}/liquid-glass/poster-accent.js"
    printf '%s\n' "$BUST" > "${CONFIG_SRC}/liquid-glass/cache-bust.txt"
    printf '%s\n' "$ACCENT_BUST" > "${CONFIG_SRC}/liquid-glass/accent-bust.txt"
    printf '%s\n' "none" > "${CONFIG_SRC}/liquid-glass/palette-bust.txt"
  fi
  printf '%s\n' "$THEME" > "${CONFIG_SRC}/liquid-glass/theme.txt"
fi

# Spotlight's backdrop mask fades to a transparent canvas. Browsers paint
# that canvas white, which is the fog over the home hero. Void it when the
# Abyss file is present. Idempotent.
void_spotlight_canvas() {
  local tmp
  tmp="$(mktemp)"
  if ! docker cp "${CONTAINER}:/usr/share/jellyfin/web/ui/spotlight.css" "$tmp" 2>/dev/null; then
    rm -f "$tmp"
    return 0
  fi
  python3 - "$tmp" <<'PY'
import sys
from pathlib import Path
p = Path(sys.argv[1])
text = p.read_text(encoding="utf-8")
# Only the body canvas. #clickzone is also `background: transparent`;
# painting that black covers the right 55% of the hero.
def paint_block(css, header, old, new):
    start = css.find(header)
    if start < 0:
        return css
    end = css.find("\n}", start)
    if end < 0:
        return css
    block = css[start:end].replace(old, new, 1)
    return css[:start] + block + css[end:]

text = paint_block(text, "\nbody {", "background: transparent;", "background: #000;")
if text.find("\nbody {") < 0:
    text = paint_block(text, "body {", "background: transparent;", "background: #000;")
# Repair a previous global replace that hid the preview behind #clickzone.
text = paint_block(text, "\n#clickzone {", "background: #000;", "background: transparent;")
text = paint_block(text, "\n#update-mute {", "background: #000;", "background: transparent;")
marker = "html {\n\tbackground: #000;\n\tcolor-scheme: dark;\n}"
if marker not in text:
    needle = ":root {\n\t/* --ease: ease-out; */\n\t--ease: cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n"
    insert = needle + "/* Backdrop mask fades to transparent. Unset canvas is white. */\nhtml {\n\tbackground: #000;\n\tcolor-scheme: dark;\n}\n\n"
    if needle not in text:
        print("spotlight.css root block not found; left unchanged")
    else:
        text = text.replace(needle, insert, 1)
p.write_text(text, encoding="utf-8")
print("spotlight canvas void")
PY
  docker cp "$tmp" "${CONTAINER}:/usr/share/jellyfin/web/ui/spotlight.css"
  rm -f "$tmp"
  log "Spotlight hero canvas is void black"
}

void_spotlight_canvas

if [[ "$NO_LENS" == "1" ]]; then
  upsert_ui_script_tags "" "" "" "" "cyberpunk-palette.js" "$PALETTE_BUST"
  log "Removed lens and poster-accent script tags"
  log "Installed + linked /web/ui/cyberpunk-palette.js?v=${PALETTE_BUST}"
else
  upsert_ui_script_tags "$LENS_FILE" "$BUST" "$ACCENT_BUST" "$OTHER_LENS_FILE" "" ""
  log "Installed + linked /web/ui/${LENS_FILE}?v=${BUST}"
  log "Installed + linked /web/ui/poster-accent.js?v=${ACCENT_BUST}"
  log "Did not link /web/ui/${OTHER_LENS_FILE}"
fi

VOID_HOOK_SRC="${ROOT}/tools/zz-cyberpunk-spotlight-void.sh"
install_void_hook() {
  local dest="$1"
  cp -f "$VOID_HOOK_SRC" "$dest"
  chmod +x "$dest"
  log "Wrote spotlight void hook: ${dest}"
}

if [[ -n "$CONFIG_SRC" ]]; then
  if [[ -d "${CONFIG_SRC}/custom-cont-init.d" ]]; then
    install_persist_hook "${CONFIG_SRC}/custom-cont-init.d/99-liquid-glass-lens.sh"
    install_void_hook "${CONFIG_SRC}/custom-cont-init.d/zz-cyberpunk-spotlight-void.sh"
  fi
  if [[ -n "$INIT_SRC" && -d "$INIT_SRC" && "$INIT_SRC" != "${CONFIG_SRC}/custom-cont-init.d" ]]; then
    if install_persist_hook "${INIT_SRC}/99-liquid-glass-lens.sh" 2>/dev/null; then
      install_void_hook "${INIT_SRC}/zz-cyberpunk-spotlight-void.sh" || \
        docker cp "$VOID_HOOK_SRC" "${CONTAINER}:/custom-cont-init.d/zz-cyberpunk-spotlight-void.sh"
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
  if curl -sS 'http://127.0.0.1:8096/web/index.html' | grep -q "cyberpunk-palette.js?v=${PALETTE_BUST}"; then
    log "index.html references cyberpunk-palette.js?v=${PALETTE_BUST}"
  else
    log "WARNING: index.html does not reference cyberpunk-palette.js?v=${PALETTE_BUST}"
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
  log "THEME=cyberpunk serves CSS and cyberpunk-palette.js. No WebGL lens."
else
  log "Look for '${CONSOLE_PREFIX} loaded' in the browser console."
fi
