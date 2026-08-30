#!/usr/bin/with-contenv bash
# Persist Jellyfin liquid-glass WebGL player lens + poster accent
# across image updates. Ensures index.html always loads the cache-busted
# ui/*.js tags so SPA navigations get the current scripts on first paint.
set -euo pipefail

WEB_DIR="${JELLYFIN_WEB_DIR:-/usr/share/jellyfin/web}"
UI_DIR="${WEB_DIR}/ui"
INDEX="${WEB_DIR}/index.html"
SRC="/config/liquid-glass/osd-lens-glass.js"
ACCENT_SRC="/config/liquid-glass/poster-accent.js"
BUST_FILE="/config/liquid-glass/cache-bust.txt"
ACCENT_BUST_FILE="/config/liquid-glass/accent-bust.txt"

BUST="refraction"
if [[ -f "$BUST_FILE" ]]; then
  BUST="$(tr -d '[:space:]' < "$BUST_FILE")"
  [[ -n "$BUST" ]] || BUST="refraction"
fi

ACCENT_BUST="accent"
if [[ -f "$ACCENT_BUST_FILE" ]]; then
  ACCENT_BUST="$(tr -d '[:space:]' < "$ACCENT_BUST_FILE")"
  [[ -n "$ACCENT_BUST" ]] || ACCENT_BUST="accent"
fi

if [[ ! -f "$SRC" ]]; then
  echo "**** [liquid-glass] osd-lens-glass.js not found — skip ****"
  exit 0
fi

mkdir -p "$UI_DIR"
cp -f "$SRC" "${UI_DIR}/osd-lens-glass.js"
if [[ -f "$ACCENT_SRC" ]]; then
  cp -f "$ACCENT_SRC" "${UI_DIR}/poster-accent.js"
fi

if [[ ! -f "$INDEX" ]]; then
  echo "**** [liquid-glass] index.html missing — skip link ****"
  exit 0
fi

[[ -f "${INDEX}.bak.liquid-glass" ]] || cp -f "$INDEX" "${INDEX}.bak.liquid-glass"

LENS_TAG="<script src=\"ui/osd-lens-glass.js?v=${BUST}\" defer></script>"
ACCENT_TAG="<script src=\"ui/poster-accent.js?v=${ACCENT_BUST}\" defer></script>"
TMP="${INDEX}.lg.tmp"

# Strip existing liquid-glass script tags, then insert ours before </body>.
sed -E \
  -e 's#[ \t]*<script[^>]*src=["'"'"'][^"'"'"']*osd-lens-glass\.js[^"'"'"']*["'"'"'][^>]*>[[:space:]]*</script>[[:space:]]*##Ig' \
  -e 's#[ \t]*<script[^>]*src=["'"'"'][^"'"'"']*poster-accent\.js[^"'"'"']*["'"'"'][^>]*>[[:space:]]*</script>[[:space:]]*##Ig' \
  "$INDEX" > "$TMP"

TAGS="${LENS_TAG}"
if [[ -f "$ACCENT_SRC" ]]; then
  TAGS="${LENS_TAG}
${ACCENT_TAG}"
fi

if grep -qi '</body>' "$TMP"; then
  awk -v tag="$TAGS" '
    BEGIN { done=0 }
    tolower($0) ~ /<\/body>/ && !done {
      print tag
      done=1
    }
    { print }
    END {
      if (!done) print tag
    }
  ' "$TMP" > "${TMP}.2"
  mv -f "${TMP}.2" "$INDEX"
else
  printf '%s\n' "$TAGS" >> "$TMP"
  mv -f "$TMP" "$INDEX"
fi
rm -f "$TMP"

echo "**** [liquid-glass] linked ${LENS_TAG} ****"
if [[ -f "$ACCENT_SRC" ]]; then
  echo "**** [liquid-glass] linked ${ACCENT_TAG} ****"
fi
