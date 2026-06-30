#!/usr/bin/env bash
#
# pack-images.sh — bundle the prebuilt Docker images for OFFLINE deploy.
#
# The LG server can't reach Docker Hub / mcr, so it can't pull node:22-bookworm-slim
# (app build) or the MSSQL image. This builds the app image HERE — cross-compiled to
# the server's linux/amd64 — pulls the MSSQL image, and saves both into one loadable
# tarball. deploy.sh auto-detects lg_magazine-images.tar.gz and does `docker load` +
# `docker compose up -d --no-build` instead of building on the server.
#
# Run this LOCALLY (where Docker + internet work). Pair it with pack.sh (source).
#
# Usage:  ./pack-images.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

PLATFORM="linux/amd64"                                   # LG server arch (build host may be arm64)
APP_IMAGE="lg-magazine:latest"                           # must match docker-compose.yml `image:`
DB_IMAGE="mcr.microsoft.com/mssql/server:2022-latest"    # must match docker-compose.yml mssql `image:`
OUT="lg_magazine-images.tar.gz"

command -v docker >/dev/null || { echo "docker not found"; exit 1; }
docker info >/dev/null 2>&1   || { echo "docker daemon not running"; exit 1; }

echo "==> Building $APP_IMAGE for $PLATFORM (cross-compile under emulation — slow)"
docker buildx build --provenance=false --platform "$PLATFORM" -t "$APP_IMAGE" --load .

echo "==> Pulling $DB_IMAGE for $PLATFORM"
docker pull --platform "$PLATFORM" "$DB_IMAGE"

echo "==> Saving both images -> $OUT"
docker save "$APP_IMAGE" "$DB_IMAGE" | gzip > "$OUT"

ABS="$REPO_DIR/$OUT"
SIZE="$(du -h "$OUT" | cut -f1)"
echo "==> Done: $OUT ($SIZE)"
echo "    $ABS"
command -v shasum >/dev/null && echo "    sha256: $(shasum -a 256 "$OUT" | cut -d' ' -f1)"
if command -v open >/dev/null; then open -R "$ABS" 2>/dev/null || true; fi
echo ""
echo "Deploy (offline): scp BOTH this and the source tarball to the server's home (~),"
echo "  then on the server:  tar xzf lg_magazine-production-*.tar.gz && cd lg_magazine && ./deploy.sh"
echo "  deploy.sh finds ../lg_magazine-images.tar.gz, loads it, and skips the build."
