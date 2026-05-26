#!/usr/bin/env bash
# Convert public/**/*.webp -> public/**/*.avif (same dir, same basename, .avif).
# Required because the LG production WAF blocks the .webp extension at the
# DMZ — see docs/resolve_webp_400_via_avif.md.
#
# Quality target: avifenc --min 24 --max 30  (visually transparent for photo
# content; typically ~30% smaller than the equivalent webp at q 82)
#
# Original .webp files are DELETED after a successful AVIF emit so the repo
# does not double-track the same image. Source-code references must be
# updated separately (see the sed step in docs/resolve_webp_400_via_avif.md).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC_DIR="$ROOT/public"

AVIFENC="$(command -v avifenc)"
DWEBP="$(command -v dwebp)"
if [ -z "$AVIFENC" ]; then
  echo "error: avifenc not installed. Install with: brew install libavif"
  exit 1
fi
if [ -z "$DWEBP" ]; then
  echo "error: dwebp not installed. Install with: brew install webp"
  exit 1
fi

total_before=0
total_after=0
converted=0
skipped=0
failed=0

human() {
  awk -v b="$1" 'BEGIN{
    s="B KB MB GB"; split(s,u," "); i=1;
    while(b>=1024 && i<4){b/=1024; i++}
    printf "%.1f%s", b, u[i]
  }'
}

printf "%-65s %10s %10s %10s\n" "FILE" "WEBP" "AVIF" "SAVED"
printf "%-65s %10s %10s %10s\n" "$(printf '─%.0s' {1..65})" "──────────" "──────────" "──────────"

while IFS= read -r -d '' src; do
  name="${src#$PUBLIC_DIR/}"
  dst="${src%.webp}.avif"

  if [ -f "$dst" ]; then
    printf "%-65s %10s %10s %10s\n" "$name" "(exists)" "skipped" ""
    skipped=$((skipped + 1))
    continue
  fi

  before=$(stat -f%z "$src" 2>/dev/null || stat -c%s "$src")

  # avifenc 1.4 can't read webp directly — decode to PNG via dwebp, then encode.
  # -q 57  -> visually transparent for photo content (~30% smaller than webp q82).
  # --speed 4 -> reasonable trade-off (0=slowest/smallest, 10=fastest/biggest).
  # --jobs all -> use all CPU cores per file.
  tmp_png="$(mktemp -t webp2avif.XXXXXX).png"
  if ! "$DWEBP" -quiet "$src" -o "$tmp_png" 2>/dev/null \
     || ! "$AVIFENC" -q 57 --speed 4 --jobs all -y 420 \
                     "$tmp_png" "$dst" >/dev/null 2>&1; then
    printf "%-65s %10s %10s %10s\n" "$name" "$(human $before)" "FAILED" ""
    failed=$((failed + 1))
    rm -f "$dst" "$tmp_png"
    continue
  fi
  rm -f "$tmp_png"

  after=$(stat -f%z "$dst" 2>/dev/null || stat -c%s "$dst")

  # If AVIF turned out larger than the webp, keep the webp and discard AVIF.
  # This shouldn't happen for photo content, but is a safety check.
  if [ "$after" -ge "$((before * 105 / 100))" ]; then
    printf "%-65s %10s %10s %10s\n" "$name" "$(human $before)" "(larger — kept webp)" ""
    rm -f "$dst"
    skipped=$((skipped + 1))
    total_before=$((total_before + before))
    total_after=$((total_after + before))
    continue
  fi

  # Success — delete the now-redundant webp to keep the repo single-format.
  rm "$src"

  pct=$((100 * after / before))
  printf "%-65s %10s %10s %9s%%\n" \
    "$name" \
    "$(human $before)" \
    "$(human $after)" \
    "-$((100 - pct))"

  converted=$((converted + 1))
  total_before=$((total_before + before))
  total_after=$((total_after + after))
done < <(find "$PUBLIC_DIR" -type f -name "*.webp" -print0)

echo ""
printf "Converted:   %d\n" "$converted"
printf "Skipped:     %d\n" "$skipped"
printf "Failed:      %d\n" "$failed"
printf "Total webp:  %s\n" "$(human $total_before)"
printf "Total avif:  %s\n" "$(human $total_after)"
if [ "$total_before" -gt 0 ]; then
  printf "Saved:       %s  (%d%%)\n" \
    "$(human $((total_before - total_after)))" \
    "$((100 - (100 * total_after / total_before)))"
fi
