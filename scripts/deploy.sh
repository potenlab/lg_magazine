#!/usr/bin/env bash
# Production deploy for this server: build image, refresh nginx-served assets,
# restart the Compose replicas, then reload nginx config.
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT="${COMPOSE_PROJECT_NAME:-potenlab}"
SUDO=()
if [[ "${EUID}" -ne 0 ]]; then
  SUDO=(sudo)
fi

echo "==> docker compose build"
"${SUDO[@]}" docker compose -p "$PROJECT" build

echo "==> extract static assets"
./scripts/extract-assets.sh

echo "==> restart replicas"
"${SUDO[@]}" docker compose -p "$PROJECT" up -d
sleep 30
"${SUDO[@]}" docker compose -p "$PROJECT" ps

echo "==> reload nginx"
"${SUDO[@]}" nginx -t
"${SUDO[@]}" systemctl reload nginx

echo "done"
