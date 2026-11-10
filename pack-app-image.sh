#!/usr/bin/env bash
#
# pack-app-image.sh — build the app image for the LG server on a Mac and save it
# as an app-only bundle ready to upload (the server already has the MSSQL image,
# so code updates only need the app: ~180 MB instead of the full pack-images.sh
# bundle).
#
# What it does:
#   1. checks this checkout: production branch, no uncommitted app changes
#   2. starts a separate Colima VM with Rosetta ("lgbuild"). The default Colima
#      VM can't run amd64 (exec format error), and qemu segfaults inside
#      `next build`; Rosetta works and leaves your other containers alone.
#   3. builds lg-magazine:latest for linux/amd64 (the LG server's CPU)
#   4. checks the image is amd64 and, with MARKER=<text>, that the server code
#      contains that text (proof the new code is inside)
#   5. saves lg_magazine-images-<stamp>-app.tar.gz plus a .txt note (commit,
#      image time, sha256, server steps) into an upload folder
#   6. stops the build VM and switches docker back to the context you had
#
# Then on the server (HIWARE): upload the .tar.gz with FileZilla to /home/potenlab
# and follow the steps in the .txt note (cd ~/lg_magazine && sudo ./redeploy.sh).
# redeploy.sh loads the newest bundle by its filename stamp.
#
# Usage:  ./pack-app-image.sh [upload-dir]      (default ~/Desktop/lg-upload-<today>)
#   MARKER=llm_upstream_timeout ./pack-app-image.sh   check a string is in the build
#   KEEP_BUILD_VM=1   leave the build VM running afterwards (faster next build)
#   ALLOW_DIRTY=1     build even with uncommitted changes (not for real deploys)
#   BUILD_CONTEXT=x   use an existing amd64-capable docker context, skip Colima
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

APP_IMAGE="lg-magazine:latest"            # must match docker-compose.yml `image:`
PLATFORM="linux/amd64"
BUILD_VM="${BUILD_VM:-lgbuild}"
OUT_DIR="${1:-$HOME/Desktop/lg-upload-$(date +%Y%m%d)}"

log(){  printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die(){  printf '\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || die "docker not found"

# 1. the checkout -------------------------------------------------------------
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
COMMIT="$(git rev-parse --short HEAD)"
if [ "${ALLOW_DIRTY:-}" != "1" ]; then
  [ "$BRANCH" = "production" ] || die "on branch '$BRANCH' — the LG server runs 'production' (ALLOW_DIRTY=1 to override)"
  # Any change or new file: the build copies the whole checkout, so the server
  # should only ever run exactly a commit.
  if [ -n "$(git status --porcelain)" ]; then
    git status --short
    die "uncommitted changes — commit them first so the server runs a known commit"
  fi
fi
log "Building $BRANCH @ $COMMIT"

# 2. an amd64-capable docker ---------------------------------------------------
ORIG_CTX="$(docker context show 2>/dev/null || echo default)"
STARTED_VM=0
cleanup() {
  if [ "$STARTED_VM" = "1" ] && [ "${KEEP_BUILD_VM:-}" != "1" ]; then
    printf '\n==> Stopping build VM %s\n' "$BUILD_VM"
    colima stop "$BUILD_VM" >/dev/null 2>&1 || true
  fi
  # After the stop: colima switches the docker context when a VM starts or stops.
  docker context use "$ORIG_CTX" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [ -n "${BUILD_CONTEXT:-}" ]; then
  CTX="$BUILD_CONTEXT"
else
  command -v colima >/dev/null || die "colima not found (brew install colima), or set BUILD_CONTEXT"
  CTX="colima-$BUILD_VM"
  if ! colima status "$BUILD_VM" >/dev/null 2>&1; then
    log "Starting build VM $BUILD_VM (Rosetta, ~1 min)"
    colima start "$BUILD_VM" --vm-type vz --vz-rosetta --cpu 6 --memory 12 --disk 60
    STARTED_VM=1
    # colima start switches the global docker context; put it back right away.
    docker context use "$ORIG_CTX" >/dev/null 2>&1 || true
  fi
fi
export DOCKER_CONTEXT="$CTX"
docker info >/dev/null 2>&1 || die "docker context '$CTX' is not reachable"

# 3. build ---------------------------------------------------------------------
log "Building $APP_IMAGE for $PLATFORM in context $CTX"
docker buildx build --provenance=false --platform "$PLATFORM" -t "$APP_IMAGE" --load .

# 4. checks --------------------------------------------------------------------
ARCH="$(docker image inspect "$APP_IMAGE" --format '{{.Architecture}}')"
CREATED="$(docker image inspect "$APP_IMAGE" --format '{{.Created}}')"
[ "$ARCH" = "amd64" ] || die "image is $ARCH, the server needs amd64"
if [ -n "${MARKER:-}" ]; then
  docker run --rm --platform "$PLATFORM" --entrypoint sh "$APP_IMAGE" \
    -c "grep -rqsF -- \"\$0\" /app/.next/server" "$MARKER" \
    || die "\"$MARKER\" not found in the built server code — is the change committed?"
  log "Found \"$MARKER\" in the built server code"
fi

# 5. save ----------------------------------------------------------------------
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
NAME="lg_magazine-images-${STAMP}-app.tar.gz"
log "Saving $APP_IMAGE -> $OUT_DIR/$NAME"
docker save "$APP_IMAGE" | gzip > "$OUT_DIR/$NAME"
SHA="$(shasum -a 256 "$OUT_DIR/$NAME" | cut -d' ' -f1)"
SIZE="$(du -h "$OUT_DIR/$NAME" | cut -f1)"

NOTE="$OUT_DIR/${NAME%.tar.gz}.txt"
cat > "$NOTE" <<EOF
LG OWL magazine — app image bundle
file:     $NAME ($SIZE)
sha256:   $SHA
commit:   $BRANCH @ $COMMIT  ($(git log -1 --format=%s))
image:    lg-magazine:latest  linux/amd64  Created $CREATED

Server steps (HIWARE terminal, type one line at a time):
1. Upload $NAME with FileZilla to /home/potenlab
2. sha256sum ~/$NAME
   must print $SHA
3. cd ~/lg_magazine
4. sudo ./redeploy.sh
   loads the newest bundle (this one), recreates the 3 app copies, refreshes static files, reloads nginx.
   The site is unavailable for about a minute.
5. sudo docker image inspect lg-magazine:latest --format '{{.Created}}'
   must print $CREATED
6. sudo docker compose ps
   3 lg-magazine rows "Up (healthy)" and mssql "Up (healthy)"

To go back to the previous version: rm ~/$NAME and rerun steps 3-4.
redeploy.sh then loads the newest bundle left in ~ (the one deployed before this).
EOF

log "Done"
echo "    $OUT_DIR/$NAME  ($SIZE)"
echo "    sha256   $SHA"
echo "    created  $CREATED"
echo "    note     $NOTE"
command -v open >/dev/null && open -R "$OUT_DIR/$NAME" 2>/dev/null || true
