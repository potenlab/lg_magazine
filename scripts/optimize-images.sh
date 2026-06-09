#!/usr/bin/env bash
# Re-encode heavy images for smaller wire size while keeping good quality.
# webp -> cwebp at quality 82 (visually transparent for photo content)
# png  -> pngquant lossy palette compression at quality 80-95 (transparent for owl PNGs)
# Replaces in place — filenames don't change, no source code edits needed.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC_DIR="$ROOT/public"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Only re-encode if file is larger than this threshold (KB).
# Anything below this isn't worth the CPU and risks zero gains.
MIN_KB=100

total_before=0
total_after=0
processed=0
skipped=0

printf "%-65s %10s %10s %10s\n" "FILE" "BEFORE" "AFTER" "SAVED"
printf "%-65s %10s %10s %10s\n" "$(printf '─%.0s' {1..65})" "──────────" "──────────" "──────────"

human() {
  awk -v b="$1" 'BEGIN{
    s="B KB MB GB"; split(s,u," "); i=1;
    while(b>=1024 && i<4){b/=1024; i++}
    printf "%.1f%s", b, u[i]
  }'
}

process() {
  local src="$1"
  local name="${src#$PUBLIC_DIR/}"
  local before_bytes
  before_bytes=$(stat -f%z "$src")
  local before_kb=$((before_bytes / 1024))

  if [ "$before_kb" -lt "$MIN_KB" ]; then
    printf "%-65s %10s %10s %10s\n" "$name" "$(human $before_bytes)" "(skipped: under ${MIN_KB}KB)" ""
    skipped=$((skipped + 1))
    total_before=$((total_before + before_bytes))
    total_after=$((total_after + before_bytes))
    return
  fi

  local dst="$TMP/$(basename "$src")"
  case "$src" in
    *.webp)
      # quality 82 — visually transparent for the magazine's photographic backgrounds
      cwebp -quiet -q 82 -m 6 "$src" -o "$dst"
      ;;
    *.png)
      # lossy palette compression — 80-95 quality, dithering
      pngquant --quality=80-95 --speed 1 --strip --force --output "$dst" "$src"
      ;;
  esac

  local after_bytes
  after_bytes=$(stat -f%z "$dst" 2>/dev/null || echo 0)

  if [ "$after_bytes" -eq 0 ] || [ "$after_bytes" -ge "$((before_bytes * 95 / 100))" ]; then
    printf "%-65s %10s %10s %10s\n" "$name" "$(human $before_bytes)" "(skipped: <5% gain)" ""
    skipped=$((skipped + 1))
    total_before=$((total_before + before_bytes))
    total_after=$((total_after + before_bytes))
    return
  fi

  cp "$dst" "$src"
  local saved=$((before_bytes - after_bytes))
  local pct=$((100 * after_bytes / before_bytes))
  printf "%-65s %10s %10s %9s%%\n" \
    "$name" \
    "$(human $before_bytes)" \
    "$(human $after_bytes)" \
    "-$((100 - pct))"

  processed=$((processed + 1))
  total_before=$((total_before + before_bytes))
  total_after=$((total_after + after_bytes))
}

while IFS= read -r -d '' f; do
  process "$f"
done < <(find "$PUBLIC_DIR" -type f \( -name '*.webp' -o -name '*.png' \) -print0)

printf "\n"
printf "Files re-encoded:  %d\n" "$processed"
printf "Files skipped:     %d\n" "$skipped"
printf "Total before:      %s\n" "$(human $total_before)"
printf "Total after:       %s\n" "$(human $total_after)"
if [ "$total_before" -gt 0 ]; then
  printf "Saved:             %s  (%d%%)\n" \
    "$(human $((total_before - total_after)))" \
    "$((100 - (100 * total_after / total_before)))"
fi
