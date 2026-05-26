#!/usr/bin/env bash
# Extract static assets from the built production image into the host directory
# served directly by nginx. Run after docker compose build and before restart.
set -euo pipefail

IMAGE="${IMAGE:-lg-magazine:latest}"
DEST="${DEST:-/var/www/lg_magazine_public}"
OWNER="${OWNER:-nginx:nginx}"

SUDO=()
if [[ "${EUID}" -ne 0 ]]; then
  SUDO=(sudo)
fi

CID="$("${SUDO[@]}" docker create "$IMAGE")"
TMP="$("${SUDO[@]}" mktemp -d /var/www/lg_magazine_assets.XXXXXX)"

cleanup() {
  "${SUDO[@]}" docker rm -f "$CID" >/dev/null 2>&1 || true
  "${SUDO[@]}" rm -rf "$TMP" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${SUDO[@]}" mkdir -p "$TMP/public" "$TMP/_next/static" "$DEST/_next/static"
"${SUDO[@]}" docker cp "$CID:/app/public/." "$TMP/public/"
"${SUDO[@]}" docker cp "$CID:/app/.next/static/." "$TMP/_next/static/"

"${SUDO[@]}" chown -R "$OWNER" "$TMP"
"${SUDO[@]}" rsync -a --delete --exclude "_next/" "$TMP/public/" "$DEST/"
"${SUDO[@]}" mkdir -p "$DEST/_next/static"
"${SUDO[@]}" rsync -a --delete "$TMP/_next/static/" "$DEST/_next/static/"
"${SUDO[@]}" chown -R "$OWNER" "$DEST"

echo "extracted assets from $IMAGE to $DEST"
"${SUDO[@]}" du -sh "$DEST" "$DEST/_next/static"
