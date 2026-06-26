#!/usr/bin/env bash
# regenerates mobile notification logos from mobile/assets/logos/_src/*.svg
# usage: bash scripts/build-logos.sh
set -euo pipefail
cd "$(dirname "$0")/.."

SVG=mobile/assets/logos/_src
OUT=mobile/assets/logos
gen() { node scripts/svg-to-png.mjs "$@" --quiet; }

# white glyph on black circle
gen "$SVG/x.svg"        "$OUT/x.png"        --size=256 --pad=0.5  --bg='#000000' --fg='#ffffff'
gen "$SVG/threads.svg"  "$OUT/threads.png"  --size=256 --pad=0.52 --bg='#000000' --fg='#ffffff'

# radial / linear gradient circles
gen "$SVG/instagram.svg" "$OUT/instagram.png" --size=256 --pad=0.52 --fg='#ffffff' \
  --bg-gradient='0:#fdf497,0.05:#fdf497,0.45:#fd5949,0.6:#d6249f,0.9:#285aeb' \
  --bg-focal='0.3,1.07' --bg-radius='1.28'
gen "$SVG/facebook.svg"  "$OUT/facebook.png"  --size=256 --pad=0.56 --fg='#ffffff' \
  --bg-gradient='0:#18acfe,1:#0163e0' --bg-linear='0.5,0.06,0.5,0.94'

# multicolor; logo carries its own shape
gen "$SVG/tiktok.svg"  "$OUT/tiktok.png"  --size=256 --pad=0.78 --no-circle --multicolor --keep-bg
gen "$SVG/youtube.svg" "$OUT/youtube.png" --size=256 --pad=0.97 --no-circle --multicolor --even-odd

# multicolor with a thin border (disc behind a slightly smaller body)
gen "$SVG/spotify.svg"  "$OUT/spotify.png"  --size=256 --pad=0.96 --bg='#000000' --multicolor
gen "$SVG/bilibili.svg" "$OUT/bilibili.png" --size=256 --pad=0.96 --bg='#ffffff' --multicolor
gen "$SVG/bluesky.svg"  "$OUT/bluesky.png"  --size=256 --pad=0.98 --bg='#ffffff' --multicolor

echo "regenerated 9 logos -> $OUT"
