#!/usr/bin/env bash
#
# redeploy.sh — fast OFFLINE redeploy of a new app build on the LG server.
#
# Use this for code/image updates after the stack is already set up (mssql + .env
# in place via deploy.sh / setup-mssql.sh). It never modifies existing data or the
# .env, and leaves the mssql container running. Steps:
#   1. load the newest images bundle (air-gapped — no registry on the server)
#   2. recreate the app replicas with the new image (mssql left running)
#      2b. apply *.mssql.sql schemas (IF NOT EXISTS — only creates missing tables)
#   3. refresh static assets on nginx's disk root  ← the step the old flow skipped
#   4. reload nginx
#
# Why step 3 matters: nginx serves /_next/static and /public DIRECTLY from
# /var/www/lg_magazine_public, NOT from the containers. A new build changes every
# chunk hash, so if you only restart the containers the on-disk chunks go stale
# and the site 503s on JS/CSS → blank page. extract-assets.sh re-syncs them.
#
# Usage:  sudo ./redeploy.sh
#
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

SUDO=(); [ "${EUID:-$(id -u)}" -ne 0 ] && SUDO=(sudo)
log(){  printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn(){ printf '\033[1;33m[!] %s\033[0m\n' "$*"; }

# 1. load newest images bundle (repo dir or parent); ignore the -latest symlink
IMG="$(ls -1 ./lg_magazine-images-*.tar.gz ../lg_magazine-images-*.tar.gz 2>/dev/null \
        | grep -v -- '-latest' | sort | tail -1 || true)"
if [ -n "${IMG:-}" ]; then
  log "Loading image bundle: $IMG"
  gunzip -c "$IMG" | "${SUDO[@]}" docker load
else
  warn "No images bundle found — using lg-magazine:latest already on host"
fi

# 2. recreate app replicas (mssql left untouched)
log "Recreating app replicas (mssql left running)"
"${SUDO[@]}" docker compose up -d --no-deps --force-recreate lg-magazine

# 2b. apply any new schema files — every *.mssql.sql is IF NOT EXISTS-guarded, so
#     this only creates tables that are missing; existing data is never touched.
#     Without this, a code update that ships a NEW table 500s until deploy.sh reruns.
if "${SUDO[@]}" docker compose ps --services --status running 2>/dev/null | grep -qx mssql; then
  PW="$(grep -E '^MSSQL_PASSWORD=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
  DB="$(grep -E '^MSSQL_DATABASE=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"; DB="${DB:-lg_magazine}"
  if [ -n "${PW:-}" ]; then
    for f in supabase/migrations/*.mssql.sql; do
      log "Applying schema (idempotent): $f"
      "${SUDO[@]}" docker compose exec -T mssql /opt/mssql-tools18/bin/sqlcmd \
        -S localhost -U sa -P "$PW" -No -d "$DB" -i /dev/stdin < "$f"
    done
  else
    warn "MSSQL_PASSWORD not found in .env — skipping schema apply (run deploy.sh if a new table shipped)"
  fi
else
  warn "mssql container not running — skipping schema apply"
fi

# 3. refresh static assets on nginx's disk root (extract-assets.sh self-sudoes)
if command -v nginx >/dev/null 2>&1; then
  log "Extracting static assets → /var/www/lg_magazine_public"
  IMAGE=lg-magazine:latest ./scripts/extract-assets.sh
  log "Reloading nginx"
  "${SUDO[@]}" nginx -t && "${SUDO[@]}" systemctl reload nginx
else
  warn "nginx not found — skipping static-asset extraction (not the LG server?)"
fi

log "Waiting for replicas to settle"
sleep 20
"${SUDO[@]}" docker compose ps
log "Redeploy complete ✓  Hard-refresh https://mybook.lgacademy.com (Cmd/Ctrl+Shift+R)"
