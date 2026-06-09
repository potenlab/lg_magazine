#!/usr/bin/env bash
# Re-encode public/vision_express/*.mp3 to "transparent" VBR quality.
# Stereo  -> libmp3lame VBR quality 2 (~190 kbps avg) — perceptually transparent
# Mono    -> libmp3lame VBR quality 4 (~165 kbps avg)
# Files already at or below the target bitrate are left untouched.
# Replaces in place — filenames don't change, so no source code edits needed.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIO_DIR="$ROOT/public/vision_express"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Target bitrate threshold (kbps). Files at or below this are skipped.
SKIP_AT_OR_BELOW_KBPS=160

total_before=0
total_after=0
processed=0
skipped=0

printf "%-55s %10s %10s %10s\n" "FILE" "BEFORE" "AFTER" "SAVED"
printf "%-55s %10s %10s %10s\n" "$(printf '─%.0s' {1..55})" "──────────" "──────────" "──────────"

shopt -s nullglob
for src in "$AUDIO_DIR"/*.mp3; do
  name="$(basename "$src")"
  before_bytes=$(stat -f%z "$src")

  bitrate_kbps=$(($(ffprobe -v error -show_entries format=bit_rate -of csv=p=0 "$src") / 1000))
  channels=$(ffprobe -v error -show_entries stream=channels -of csv=p=0 "$src" | head -1)

  if [ "$bitrate_kbps" -le "$SKIP_AT_OR_BELOW_KBPS" ]; then
    printf "%-55s %10s %10s %10s\n" "$name" "$(numfmt --to=iec --suffix=B $before_bytes)" "(skipped: ${bitrate_kbps}kbps already low)" ""
    skipped=$((skipped + 1))
    total_before=$((total_before + before_bytes))
    total_after=$((total_after + before_bytes))
    continue
  fi

  dst="$TMP/$name"
  if [ "$channels" = "1" ]; then
    # Mono speech / SFX — VBR quality 4 (~165 kbps) is transparent
    ffmpeg -loglevel error -y -i "$src" -codec:a libmp3lame -q:a 4 -ac 1 "$dst"
  else
    # Stereo music / ambient — VBR quality 2 (~190 kbps) is transparent
    ffmpeg -loglevel error -y -i "$src" -codec:a libmp3lame -q:a 2 "$dst"
  fi

  after_bytes=$(stat -f%z "$dst")

  # Only accept if new is meaningfully smaller (>5% reduction).
  if [ "$after_bytes" -ge "$((before_bytes * 95 / 100))" ]; then
    printf "%-55s %10s %10s %10s\n" "$name" "$(numfmt --to=iec --suffix=B $before_bytes)" "(skipped: <5% gain)" ""
    skipped=$((skipped + 1))
    total_before=$((total_before + before_bytes))
    total_after=$((total_after + before_bytes))
    continue
  fi

  cp "$dst" "$src"
  saved=$((before_bytes - after_bytes))
  pct=$((100 * after_bytes / before_bytes))
  printf "%-55s %10s %10s %9s%%\n" \
    "$name" \
    "$(numfmt --to=iec --suffix=B $before_bytes)" \
    "$(numfmt --to=iec --suffix=B $after_bytes)" \
    "-$((100 - pct))"

  processed=$((processed + 1))
  total_before=$((total_before + before_bytes))
  total_after=$((total_after + after_bytes))
done

printf "\n"
printf "Files re-encoded:  %d\n" "$processed"
printf "Files skipped:     %d\n" "$skipped"
printf "Total before:      %s\n" "$(numfmt --to=iec --suffix=B $total_before)"
printf "Total after:       %s\n" "$(numfmt --to=iec --suffix=B $total_after)"
printf "Saved:             %s  (%d%%)\n" \
  "$(numfmt --to=iec --suffix=B $((total_before - total_after)))" \
  "$((100 - (100 * total_after / total_before)))"
