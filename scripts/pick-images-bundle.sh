#!/usr/bin/env bash
#
# pick_images_bundle — echo the path of the newest prebuilt-images bundle, or
# nothing when there is none. Sourced by deploy.sh and redeploy.sh so both agree
# on which file gets loaded.
#
# Looks in the repo dir and its parent, because scp/FileZilla usually drops the
# tarball in the server's home (~) while the repo lives in ~/lg_magazine.
#
# Ordering is by FILENAME (the YYYYMMDD-HHMMSS stamp), never by path. Sorting
# whole paths puts every "../" entry before every "./" entry ('.' < '/'), so a
# stale bundle left in the repo dir would outrank a newer one in the home dir and
# the deploy would silently ship old code.
#
# The -latest symlink is skipped — it often does not survive a file transfer.
#
# Test: scripts/test-pick-images-bundle.sh

pick_images_bundle() {
  local dir="${1:-.}"
  ls -1 "$dir"/lg_magazine-images*.tar.gz "$dir"/../lg_magazine-images*.tar.gz 2>/dev/null \
    | grep -v -- '-latest' \
    | awk -F/ '{ print $NF "\t" $0 }' \
    | sort -k1,1 \
    | tail -1 \
    | cut -f2-
}
