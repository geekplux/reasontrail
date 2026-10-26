#!/bin/sh
# Regenerates src/viewer/fonts/*.woff2, the two fonts the one-file local viewer inlines (v7 §3.2, DECISIONS 2026-10-23):
# Geist and Geist Mono from @fontsource-variable, the weight axis cut to 400–600 and the glyphs to Latin plus the
# punctuation the map uses (about 16 KB and 13 KB), so the viewer works offline inside its 300 KB budget.
#
# Usage (from anywhere, after `pnpm install`):  sh scripts/subset-viewer-fonts.sh
# Needs only uv (https://docs.astral.sh/uv/): `uvx` fetches a pinned fonttools with brotli into its cache on first run,
# so nothing is installed globally. Run it again only when the fontsource version or the glyph list changes, then
# `pnpm build:cli && pnpm check:size`.
set -eu
cd "$(dirname "$0")/.."
FT='uvx --quiet --from fonttools[woff]==4.65.0'
U='U+0020-007E,U+00A0-00FF,U+00D7,U+2013-2014,U+2018-201D,U+2022,U+2026,U+203A,U+2190-2193,U+2212,U+2248,U+2264-2265'
tmp=$(mktemp -d)
trap 'rm -r "$tmp"' EXIT
for n in geist geist-mono; do
  $FT fonttools varLib.instancer "node_modules/@fontsource-variable/$n/files/$n-latin-wght-normal.woff2" wght=400:600 -q -o "$tmp/$n.ttf"
  $FT pyftsubset "$tmp/$n.ttf" --unicodes="$U" --layout-features='kern,tnum' --flavor=woff2 --output-file="src/viewer/fonts/$n-400-600.woff2"
done
ls -l src/viewer/fonts
