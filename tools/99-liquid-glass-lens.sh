#!/usr/bin/with-contenv bash
# Persist the chosen Jellyfin theme lens + poster accent across image updates.
# theme.txt selects one lens. This hook links that script only.
#   liquid            → osd-lens-glass.js
#   cyberpunk-liquid  → osd-lens-cyberpunk.js
#   cyberpunk         → no lens; link cyberpunk-palette.js
set -euo pipefail

WEB_DIR="${JELLYFIN_WEB_DIR:-/usr/share/jellyfin/web}"
UI_DIR="${WEB_DIR}/ui"
INDEX="${WEB_DIR}/index.html"
CONF="/config/liquid-glass"
THEME_FILE="${CONF}/theme.txt"
BUST_FILE="${CONF}/cache-bust.txt"
ACCENT_SRC="${CONF}/poster-accent.js"
ACCENT_BUST_FILE="${CONF}/accent-bust.txt"
PALETTE_SRC="${CONF}/cyberpunk-palette.js"
PALETTE_BUST_FILE="${CONF}/palette-bust.txt"

THEME="liquid"
if [[ -f "$THEME_FILE" ]]; then
  THEME="$(tr -d '[:space:]' < "$THEME_FILE")"
  [[ -n "$THEME" ]] || THEME="liquid"
fi

strip_ui_scripts() {
  local tmp="${INDEX}.lg.tmp"
  [[ -f "$INDEX" ]] || return 0
  sed -E \
    -e 's#[ \t]*<script[^>]*src=["'"'"'][^"'"'"']*osd-lens-glass\.js[^"'"'"']*["'"'"'][^>]*>[[:space:]]*</script>[[:space:]]*##Ig' \
    -e 's#[ \t]*<script[^>]*src=["'"'"'][^"'"'"']*osd-lens-cyberpunk\.js[^"'"'"']*["'"'"'][^>]*>[[:space:]]*</script>[[:space:]]*##Ig' \
    -e 's#[ \t]*<script[^>]*src=["'"'"'][^"'"'"']*poster-accent\.js[^"'"'"']*["'"'"'][^>]*>[[:space:]]*</script>[[:space:]]*##Ig' \
    -e 's#[ \t]*<script[^>]*src=["'"'"'][^"'"'"']*cyberpunk-palette\.js[^"'"'"']*["'"'"'][^>]*>[[:space:]]*</script>[[:space:]]*##Ig' \
    "$INDEX" > "$tmp"
  mv -f "$tmp" "$INDEX"
}

link_palette() {
  local bust="palette" tag tmp
  [[ -f "$PALETTE_SRC" ]] || {
    echo "**** [liquid-glass] cyberpunk-palette.js missing — skip ****"
    return 0
  }
  if [[ -f "$PALETTE_BUST_FILE" ]]; then
    bust="$(tr -d '[:space:]' < "$PALETTE_BUST_FILE")"
    [[ -n "$bust" ]] || bust="palette"
  fi
  mkdir -p "$UI_DIR"
  cp -f "$PALETTE_SRC" "${UI_DIR}/cyberpunk-palette.js"
  [[ -f "$INDEX" ]] || return 0
  [[ -f "${INDEX}.bak.liquid-glass" ]] || cp -f "$INDEX" "${INDEX}.bak.liquid-glass"
  strip_ui_scripts
  tag="<script src=\"ui/cyberpunk-palette.js?v=${bust}\" defer></script>"
  tmp="${INDEX}.lg.tmp"
  if grep -qi '</body>' "$INDEX"; then
    awk -v tag="$tag" '
      BEGIN { done=0 }
      tolower($0) ~ /<\/body>/ && !done {
        print tag
        done=1
      }
      { print }
      END { if (!done) print tag }
    ' "$INDEX" > "$tmp"
    mv -f "$tmp" "$INDEX"
  else
    printf '%s\n' "$tag" >> "$INDEX"
  fi
  echo "**** [liquid-glass] theme=cyberpunk linked ${tag} ****"
}

case "$THEME" in
  cyberpunk)
    mkdir -p "$UI_DIR"
    rm -f "${UI_DIR}/osd-lens-glass.js" "${UI_DIR}/osd-lens-cyberpunk.js" "${UI_DIR}/poster-accent.js"
    link_palette
    exit 0
    ;;
  cyberpunk-liquid)
    SRC="${CONF}/osd-lens-cyberpunk.js"
    LENS_NAME="osd-lens-cyberpunk.js"
    OTHER_NAME="osd-lens-glass.js"
    ;;
  *)
    SRC="${CONF}/osd-lens-glass.js"
    LENS_NAME="osd-lens-glass.js"
    OTHER_NAME="osd-lens-cyberpunk.js"
    ;;
esac

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
  echo "**** [liquid-glass] ${LENS_NAME} not found — skip ****"
  exit 0
fi

mkdir -p "$UI_DIR"
cp -f "$SRC" "${UI_DIR}/${LENS_NAME}"
rm -f "${UI_DIR}/${OTHER_NAME}" "${UI_DIR}/cyberpunk-palette.js"
if [[ -f "$ACCENT_SRC" ]]; then
  cp -f "$ACCENT_SRC" "${UI_DIR}/poster-accent.js"
fi

if [[ ! -f "$INDEX" ]]; then
  echo "**** [liquid-glass] index.html missing — skip link ****"
  exit 0
fi

[[ -f "${INDEX}.bak.liquid-glass" ]] || cp -f "$INDEX" "${INDEX}.bak.liquid-glass"

LENS_TAG="<script src=\"ui/${LENS_NAME}?v=${BUST}\" defer></script>"
ACCENT_TAG="<script src=\"ui/poster-accent.js?v=${ACCENT_BUST}\" defer></script>"
TMP="${INDEX}.lg.tmp"

# Strip both lens tags, then insert only the theme match.
sed -E \
  -e 's#[ \t]*<script[^>]*src=["'"'"'][^"'"'"']*osd-lens-glass\.js[^"'"'"']*["'"'"'][^>]*>[[:space:]]*</script>[[:space:]]*##Ig' \
  -e 's#[ \t]*<script[^>]*src=["'"'"'][^"'"'"']*osd-lens-cyberpunk\.js[^"'"'"']*["'"'"'][^>]*>[[:space:]]*</script>[[:space:]]*##Ig' \
  -e 's#[ \t]*<script[^>]*src=["'"'"'][^"'"'"']*poster-accent\.js[^"'"'"']*["'"'"'][^>]*>[[:space:]]*</script>[[:space:]]*##Ig' \
  -e 's#[ \t]*<script[^>]*src=["'"'"'][^"'"'"']*cyberpunk-palette\.js[^"'"'"']*["'"'"'][^>]*>[[:space:]]*</script>[[:space:]]*##Ig' \
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

echo "**** [liquid-glass] theme=${THEME} linked ${LENS_TAG} ****"
if [[ -f "$ACCENT_SRC" ]]; then
  echo "**** [liquid-glass] linked ${ACCENT_TAG} ****"
fi
