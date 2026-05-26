#!/usr/bin/env bash
# Pre-compress static text assets as .gz and .br siblings so nginx can serve
# them with zero per-request CPU via `gzip_static` / `brotli_static`.
#
# Run AFTER `npm run build` and BEFORE `scripts/extract-assets.sh` so the
# .gz/.br files travel with the artifacts to /var/www/lg-magazine.
#
# Targets:  .js  .css  .svg  .json  .txt  .map  (anything text-y)
# Skips:    .woff2 (already compressed),  files under 1 KB (compression overhead > savings)

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Default targets in priority order:
#   1. Production host path (after `scripts/extract-assets.sh` has run).
#   2. Repo working tree (for local development / verification).
# Pass an explicit directory as an argument to override.
if [ "$#" -gt 0 ]; then
  DIRS=("$@")
elif [ -d "/var/www/lg-magazine" ]; then
  DIRS=(
    "/var/www/lg-magazine/_next/static"
    "/var/www/lg-magazine/public"
  )
else
  DIRS=(
    "$ROOT/.next/static"
    "$ROOT/public"
  )
fi

GZIP="$(command -v gzip)"
BROTLI="$(command -v brotli || true)"
MIN_BYTES=1024

if [ -z "$BROTLI" ]; then
  echo "warning: brotli not installed — only .gz siblings will be created."
  echo "         install with:  brew install brotli   (or apt: brotli)"
fi

total_orig=0
total_gz=0
total_br=0
files_compressed=0

human() {
  awk -v b="$1" 'BEGIN{
    s="B KB MB GB"; split(s,u," "); i=1;
    while(b>=1024 && i<4){b/=1024; i++}
    printf "%.1f%s", b, u[i]
  }'
}

for DIR in "${DIRS[@]}"; do
  if [ ! -d "$DIR" ]; then
    echo "skipping (not found): $DIR"
    continue
  fi
  echo "compressing in $DIR ..."

  while IFS= read -r -d '' f; do
    sz=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f")
    [ "$sz" -lt "$MIN_BYTES" ] && continue

    # gzip -9 -k -n : max compression, keep original, no timestamp (better caching)
    "$GZIP" -9 -k -n -f "$f"
    gz_sz=$(stat -f%z "$f.gz" 2>/dev/null || stat -c%s "$f.gz")

    br_sz=0
    if [ -n "$BROTLI" ]; then
      # quality 11 = max, only worth it at build time (slow but tiny output)
      "$BROTLI" -k -q 11 -f "$f" -o "$f.br"
      br_sz=$(stat -f%z "$f.br" 2>/dev/null || stat -c%s "$f.br")
    fi

    total_orig=$((total_orig + sz))
    total_gz=$((total_gz + gz_sz))
    total_br=$((total_br + br_sz))
    files_compressed=$((files_compressed + 1))
  done < <(find "$DIR" -type f \
            \( -name '*.js' -o -name '*.css' -o -name '*.svg' \
               -o -name '*.json' -o -name '*.txt' -o -name '*.map' \) \
            ! -name '*.gz' ! -name '*.br' -print0)
done

echo ""
echo "Files compressed:  $files_compressed"
echo "Original bytes:    $(human $total_orig)"
echo "After gzip (.gz):  $(human $total_gz)   ($((total_orig > 0 ? 100 - (100 * total_gz / total_orig) : 0))% smaller)"
if [ "$total_br" -gt 0 ]; then
  echo "After brotli (.br):$(human $total_br)   ($((total_orig > 0 ? 100 - (100 * total_br / total_orig) : 0))% smaller)"
fi
