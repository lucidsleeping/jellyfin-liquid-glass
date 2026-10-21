#!/usr/bin/with-contenv bash
# Runs after abyss-spotlight.sh, which re-downloads spotlight.css on every
# start and restores a transparent canvas. The backdrop mask fades artwork
# to that canvas; an unset canvas paints white over the home hero.
set -euo pipefail

CSS="${JELLYFIN_WEB_DIR:-/usr/share/jellyfin/web}/ui/spotlight.css"
[ -f "$CSS" ] || exit 0

# Only the body canvas. A global replace also paints #clickzone, which
# covers the right 55% of the hero and hides the preview.
sed -i '/^body {/,/^}/ s/background: transparent;/background: #000;/' "$CSS"
# Repair a previous global replace. These controls are transparent upstream.
sed -i '/^#clickzone {/,/^}/ s/background: #000;/background: transparent;/' "$CSS"
sed -i '/^#update-mute {/,/^}/ s/background: #000;/background: transparent;/' "$CSS"

if ! grep -q 'color-scheme: dark' "$CSS"; then
  sed -i '/^body {/i\
html {\
	background: #000;\
	color-scheme: dark;\
}\
' "$CSS"
fi

echo "**** [cyberpunk] spotlight canvas void ****"
