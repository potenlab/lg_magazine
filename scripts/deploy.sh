#!/usr/bin/env bash
# Production deploy for this host: build, refresh nginx-served assets, restart
# Compose replicas, then validate and reload nginx.
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT="${COMPOSE_PROJECT_NAME:-potenlab}"
ASSET_DEST="${ASSET_DEST:-/var/www/lg_magazine_public}"

SUDO=()
if [[ "${EUID}" -ne 0 ]]; then
  SUDO=(sudo)
fi

echo "==> docker compose build"
"${SUDO[@]}" docker compose -p "$PROJECT" build

echo "==> extract static assets"
DEST="$ASSET_DEST" ./scripts/extract-assets.sh

echo "==> pre-compress static text assets"
"${SUDO[@]}" ./scripts/precompress-assets.sh "$ASSET_DEST/_next/static" "$ASSET_DEST"

echo "==> restart replicas"
"${SUDO[@]}" docker compose -p "$PROJECT" up -d
sleep 45
"${SUDO[@]}" docker compose -p "$PROJECT" ps

echo "==> reload nginx"
"${SUDO[@]}" nginx -t
"${SUDO[@]}" systemctl reload nginx

echo "done"
