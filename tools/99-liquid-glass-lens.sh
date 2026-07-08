#!/usr/bin/with-contenv bash
# Persist Jellyfin liquid-glass WebGL player lens across image updates.
# Ensures index.html always loads ui/osd-lens-glass.js?v=refraction… so
# menu / SPA navigations get the cache-busted lens on first paint.
set -euo pipefail

WEB_DIR="${JELLYFIN_WEB_DIR:-/usr/share/jellyfin/web}"
UI_DIR="${WEB_DIR}/ui"
INDEX="${WEB_DIR}/index.html"
SRC="/config/liquid-glass/osd-lens-glass.js"
BUST_FILE="/config/liquid-glass/cache-bust.txt"

BUST="refraction"
if [[ -f "$BUST_FILE" ]]; then
  BUST="$(tr -d '[:space:]' < "$BUST_FILE")"
  [[ -n "$BUST" ]] || BUST="refraction"
fi

if [[ ! -f "$SRC" ]]; then
  echo "**** [liquid-glass] osd-lens-glass.js not found — skip ****"
  exit 0
fi

mkdir -p "$UI_DIR"
cp -f "$SRC" "${UI_DIR}/osd-lens-glass.js"

if [[ ! -f "$INDEX" ]]; then
  echo "**** [liquid-glass] index.html missing — skip link ****"
  exit 0
fi

[[ -f "${INDEX}.bak.liquid-glass" ]] || cp -f "$INDEX" "${INDEX}.bak.liquid-glass"

TAG="<script src=\"ui/osd-lens-glass.js?v=${BUST}\" defer></script>"
TMP="${INDEX}.lg.tmp"

# Strip any existing osd-lens-glass.js script tag, then insert ours before </body>.
# Works without python (jellyfin image may not ship it).
sed -E \
  's#[ \t]*<script[^>]*src=["'"'"'][^"'"'"']*osd-lens-glass\.js[^"'"'"']*["'"'"'][^>]*>[[:space:]]*</script>[[:space:]]*##Ig' \
  "$INDEX" > "$TMP"

if grep -qi '</body>' "$TMP"; then
  # Insert tag immediately before the first </body>
  awk -v tag="$TAG" '
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
  printf '%s\n' "$TAG" >> "$TMP"
  mv -f "$TMP" "$INDEX"
fi
rm -f "$TMP"

echo "**** [liquid-glass] linked ${TAG} ****"
