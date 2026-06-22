#!/usr/bin/env bash
# Build-less deploy for an outbound-blocked VM.
#
# Use when the VM cannot reach github / npm / Docker Hub (full outbound block).
# Instead of `docker compose build`, this LOADS a prebuilt image tarball that was
# built off-box and uploaded via scp, then runs the same extract -> precompress ->
# restart -> reload steps as scripts/deploy.sh.
#
# Off-box (a machine with internet, correct branch checked out):
#   docker compose -p potenlab build
#   docker save lg-magazine:latest | gzip > lg-magazine-latest.tar.gz
#   scp lg-magazine-latest.tar.gz user@203.247.146.226:/path/to/lg_magazine/
#
# On the VM:
#   ./scripts/deploy-from-image.sh [path-to-tarball]   (default: lg-magazine-latest.tar.gz)
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT="${COMPOSE_PROJECT_NAME:-lg_magazine}"
ASSET_DEST="${ASSET_DEST:-/var/www/lg_magazine_public}"
TARBALL="${1:-lg-magazine-latest.tar.gz}"

SUDO=()
if [[ "${EUID}" -ne 0 ]]; then
  SUDO=(sudo)
fi

if [[ ! -f "$TARBALL" ]]; then
  echo "ERROR: image tarball not found: $TARBALL" >&2
  echo "Build it off-box: docker save lg-magazine:latest | gzip > lg-magazine-latest.tar.gz" >&2
  exit 1
fi

echo "==> load image from $TARBALL (no build, no outbound needed)"
gunzip -c "$TARBALL" | "${SUDO[@]}" docker load

echo "==> extract static assets"
DEST="$ASSET_DEST" ./scripts/extract-assets.sh

echo "==> pre-compress static text assets"
"${SUDO[@]}" ./scripts/precompress-assets.sh "$ASSET_DEST/_next/static" "$ASSET_DEST"

echo "==> restart replicas (reuses loaded lg-magazine:latest; no rebuild)"
"${SUDO[@]}" docker compose -p "$PROJECT" up -d --no-build
sleep 45
"${SUDO[@]}" docker compose -p "$PROJECT" ps

echo "==> reload nginx"
"${SUDO[@]}" nginx -t
"${SUDO[@]}" systemctl reload nginx

echo "done"
