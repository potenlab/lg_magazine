#!/usr/bin/env bash
# Convert public/**/*.avif -> public/**/*.jpg (same dir, same basename, .jpg).
# Required because the LG production WAF blocks BOTH the .webp AND .avif
# extensions — see docs/diagnose_webp_400.md probe matrix. JPEG passes through.
#
# Pipeline: avifdec (libavif) → PNG → cjpeg (mozjpeg) → JPEG.
#   -quality 85   visually transparent for photo content
#   -optimize     Huffman table optimization (~3% smaller)
#   -progressive  incremental render, also ~5% smaller
#
# Original .avif files are DELETED after a successful JPEG emit. Source-code
# references must be updated separately (sed across src/).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC_DIR="$ROOT/public"

FFMPEG="$(command -v ffmpeg)"
if [ -z "$FFMPEG" ]; then
  echo "error: ffmpeg not installed. Install with: brew install ffmpeg"
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

printf "%-65s %10s %10s %10s\n" "FILE" "AVIF" "JPEG" "CHANGE"
printf "%-65s %10s %10s %10s\n" "$(printf '─%.0s' {1..65})" "──────────" "──────────" "──────────"

while IFS= read -r -d '' src; do
  name="${src#$PUBLIC_DIR/}"
  dst="${src%.avif}.jpg"

  if [ -f "$dst" ]; then
    printf "%-65s %10s %10s %10s\n" "$name" "(exists)" "skipped" ""
    skipped=$((skipped + 1))
    continue
  fi

  before=$(stat -f%z "$src" 2>/dev/null || stat -c%s "$src")

  # ffmpeg reads AVIF and writes JPEG in one step.
  #   -q:v 3        JPEG quality ~85 (1=best, 31=worst). Visually transparent for photos.
  #   -huffman optimal   Huffman-table optimization, ~3% smaller.
  if ! "$FFMPEG" -loglevel error -y -i "$src" -q:v 3 -huffman optimal "$dst" 2>/dev/null; then
    printf "%-65s %10s %10s %10s\n" "$name" "$(human $before)" "FAILED" ""
    failed=$((failed + 1))
    rm -f "$dst"
    continue
  fi

  after=$(stat -f%z "$dst" 2>/dev/null || stat -c%s "$dst")

  # Delete source so we don't ship both formats.
  rm "$src"

  if [ "$after" -le "$before" ]; then
    pct=$((100 * after / before))
    delta="-$((100 - pct))%"
  else
    pct=$((100 * after / before))
    delta="+$((pct - 100))%"
  fi
  printf "%-65s %10s %10s %10s\n" \
    "$name" \
    "$(human $before)" \
    "$(human $after)" \
    "$delta"

  converted=$((converted + 1))
  total_before=$((total_before + before))
  total_after=$((total_after + after))
done < <(find "$PUBLIC_DIR" -type f -name "*.avif" -print0)

echo ""
printf "Converted:   %d\n" "$converted"
printf "Skipped:     %d\n" "$skipped"
printf "Failed:      %d\n" "$failed"
printf "Total avif:  %s\n" "$(human $total_before)"
printf "Total jpeg:  %s\n" "$(human $total_after)"
if [ "$total_before" -gt 0 ]; then
  diff=$((total_after - total_before))
  if [ "$diff" -ge 0 ]; then
    printf "Change:      +%s  (+%d%%)\n" \
      "$(human $diff)" "$((100 * total_after / total_before - 100))"
  else
    printf "Saved:       %s  (-%d%%)\n" \
      "$(human $((total_before - total_after)))" \
      "$((100 - (100 * total_after / total_before)))"
  fi
fi
