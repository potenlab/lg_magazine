#!/usr/bin/env bash
#
# pack.sh — build a deployable source tarball of the `production` branch.
#
# Run this LOCALLY (where git works). It produces a self-contained .tar.gz of
# everything the server needs to `docker compose build` + deploy — WITHOUT git.
# Transfer the tarball to the LG server (scp/sftp/usb), extract, run deploy.sh.
#
# It uses `git archive`, so ONLY committed, tracked files are included:
#   - .env, node_modules/, .next/, .git/ are excluded automatically (secrets safe)
#   - src/, public/, Dockerfile, docker-compose.yml, supabase/migrations/,
#     package*.json, next.config.ts, deploy.sh, etc. are all included
#
# Usage:
#   ./pack.sh                       # packs production -> lg_magazine-production-<timestamp>.tar.gz
#   ./pack.sh <ref> <output.tgz>    # custom git ref / output path

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

REF="${1:-production}"
TS="$(date +%Y%m%d-%H%M%S)"               # local-time stamp, e.g. 20260629-184230
OUT="${2:-lg_magazine-production-${TS}.tar.gz}"
LATEST="lg_magazine-production-latest.tar.gz"
PREFIX="lg_magazine/"

command -v git >/dev/null || { echo "git not found"; exit 1; }
git rev-parse --verify "$REF" >/dev/null 2>&1 || { echo "unknown git ref: $REF"; exit 1; }

# Warn if there are uncommitted changes (git archive packs the committed tree,
# not your working dir — so anything uncommitted won't make it into the tarball).
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[!] You have uncommitted changes — git archive packs the COMMITTED tree of '$REF'."
  echo "    Commit first if you want those changes in the tarball."
fi

echo "==> Packing '$REF' -> $OUT"
git archive --format=tar.gz --prefix="$PREFIX" -o "$OUT" "$REF"

# Refresh the convenience "latest" pointer to this build.
ln -sf "$OUT" "$LATEST"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "==> Done: $OUT ($SIZE)"
echo "    latest -> $OUT"
if command -v shasum >/dev/null; then
  echo "    sha256: $(shasum -a 256 "$OUT" | cut -d' ' -f1)"
fi
echo ""
echo "Next:"
echo "  1) Copy to the server:   scp $OUT user@lg-server:/srv/"
echo "  2) On the server:        cd /srv && tar xzf $(basename "$OUT") && cd lg_magazine"
echo "  3) Deploy:               ./deploy.sh"
