#!/usr/bin/env bash
#
# Self-check for pick_images_bundle. Run: ./scripts/test-pick-images-bundle.sh
#
# The case that matters: a stale bundle sitting in the repo dir must NOT beat a
# newer one dropped in the home dir. That mistake ships old code to production
# without a single error message.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")/.."
. ./scripts/pick-images-bundle.sh

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
HOME_DIR="$TMP/home"
REPO_DIR="$HOME_DIR/lg_magazine"
mkdir -p "$REPO_DIR"

fail=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then
    echo "PASS  $1"
  else
    echo "FAIL  $1"
    echo "        expected: $2"
    echo "        actual:   $3"
    fail=1
  fi
}
reset() { rm -f "$HOME_DIR"/*.tar.gz "$REPO_DIR"/*.tar.gz; }
base() { [ -n "$1" ] && basename "$1" || echo "(none)"; }

reset
check "no bundle anywhere" "(none)" "$(base "$(cd "$REPO_DIR" && pick_images_bundle .)")"

reset
touch "$HOME_DIR/lg_magazine-images-20260806-093216.tar.gz"
check "bundle in home dir only" \
  "lg_magazine-images-20260806-093216.tar.gz" \
  "$(base "$(cd "$REPO_DIR" && pick_images_bundle .)")"

reset
touch "$REPO_DIR/lg_magazine-images-20260806-093216.tar.gz"
check "bundle in repo dir only" \
  "lg_magazine-images-20260806-093216.tar.gz" \
  "$(base "$(cd "$REPO_DIR" && pick_images_bundle .)")"

# the regression this function exists for
reset
touch "$REPO_DIR/lg_magazine-images-20260804-121112.tar.gz"
touch "$HOME_DIR/lg_magazine-images-20260806-093216.tar.gz"
check "newer in home beats older in repo" \
  "lg_magazine-images-20260806-093216.tar.gz" \
  "$(base "$(cd "$REPO_DIR" && pick_images_bundle .)")"

reset
touch "$HOME_DIR/lg_magazine-images-20260804-121112.tar.gz"
touch "$REPO_DIR/lg_magazine-images-20260806-093216.tar.gz"
check "newer in repo beats older in home" \
  "lg_magazine-images-20260806-093216.tar.gz" \
  "$(base "$(cd "$REPO_DIR" && pick_images_bundle .)")"

reset
touch "$HOME_DIR/lg_magazine-images-20260806-093216.tar.gz"
ln -s lg_magazine-images-20260806-093216.tar.gz "$HOME_DIR/lg_magazine-images-latest.tar.gz"
check "the -latest symlink is ignored" \
  "lg_magazine-images-20260806-093216.tar.gz" \
  "$(base "$(cd "$REPO_DIR" && pick_images_bundle .)")"

echo
[ "$fail" -eq 0 ] && echo "ALL PASS" || { echo "FAILURES PRESENT"; exit 1; }
