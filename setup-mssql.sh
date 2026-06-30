#!/usr/bin/env bash
#
# setup-mssql.sh — wipe and recreate the lg_magazine MSSQL from scratch.
#
# Idempotent & safe to re-run. It:
#   1. ensures a policy-valid SA password in .env (SQL Server rejects weak ones)
#   2. removes the existing mssql container + its data volume (full wipe)
#   3. starts a fresh mssql, waits for it to become healthy (or shows the crash)
#   4. creates the database and applies the v3_sessions schema
#   5. recreates the 3 app replicas so they reconnect to the new DB
#
# Usage (run from the repo dir, e.g. ~/lg_magazine):
#   sudo ./setup-mssql.sh                          # keep/auto-fix the .env password
#   sudo MSSQL_PASSWORD='My!Str0ng#Pass' ./setup-mssql.sh   # force a specific password
#
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

SVC=mssql
CTR=lg_magazine-mssql-1
VOL=lg_magazine_mssql-data
ENV_FILE=.env
SCHEMA=supabase/migrations/v3_sessions.mssql.sql
SQLCMD="/opt/mssql-tools18/bin/sqlcmd"

log(){ printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn(){ printf '\033[1;33m[!] %s\033[0m\n' "$*"; }
die(){ printf '\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

command -v docker >/dev/null            || die "docker not found"
docker compose version >/dev/null 2>&1  || die "docker compose v2 not found"
[ -f "$SCHEMA" ] || die "schema missing: $SCHEMA — run this from the repo dir (~/lg_magazine)"
touch "$ENV_FILE"

# ---------------------------------------------------------------------------
# 1. ensure a policy-valid SA password
#    SQL Server requires >= 8 chars containing 3 of: upper, lower, digit, symbol.
# ---------------------------------------------------------------------------
valid_pw(){
  local p="$1" n=0
  [ "${#p}" -ge 8 ] || return 1
  [[ "$p" =~ [A-Z] ]]            && n=$((n+1))
  [[ "$p" =~ [a-z] ]]            && n=$((n+1))
  [[ "$p" =~ [0-9] ]]            && n=$((n+1))
  [[ "$p" =~ [^A-Za-z0-9] ]]     && n=$((n+1))
  [ "$n" -ge 3 ]
}

PW="${MSSQL_PASSWORD:-$(grep -E '^MSSQL_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2-)}"
if ! valid_pw "$PW"; then
  warn "MSSQL_PASSWORD in .env is weak/empty — SQL Server would reject it. Setting a strong default."
  PW='Lg!Magazine2026#Db'
fi
if grep -qE '^MSSQL_PASSWORD=' "$ENV_FILE"; then
  sed -i "s|^MSSQL_PASSWORD=.*|MSSQL_PASSWORD=${PW}|" "$ENV_FILE"
else
  printf 'MSSQL_PASSWORD=%s\n' "$PW" >> "$ENV_FILE"
fi
echo "    SA password: $PW"

DB="$(grep -E '^MSSQL_DATABASE=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
DB="${DB:-lg_magazine}"
echo "    database:    $DB"

# ---------------------------------------------------------------------------
# 2. wipe any existing mssql (container + volume)
# ---------------------------------------------------------------------------
log "Removing existing MSSQL container + data volume"
docker compose rm -sf "$SVC" 2>/dev/null || true
docker rm -f "$CTR"          2>/dev/null || true
docker volume rm "$VOL"      2>/dev/null || true

# ---------------------------------------------------------------------------
# 3. start fresh mssql and wait for healthy (or surface the crash)
# ---------------------------------------------------------------------------
log "Starting fresh MSSQL"
docker compose up -d "$SVC"

log "Waiting for MSSQL to become healthy (first boot ~30-60s)"
ok=0
for _ in $(seq 1 40); do
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$CTR" 2>/dev/null || echo none)"
  state="$(docker inspect -f '{{.State.Status}}' "$CTR" 2>/dev/null || echo none)"
  if [ "$health" = healthy ]; then ok=1; break; fi
  if [ "$state" = restarting ] || [ "$state" = exited ]; then
    echo; docker logs --tail 40 "$CTR" 2>&1 || true
    die "MSSQL is '$state' (crash loop) — see logs above."
  fi
  printf '.'; sleep 3
done
echo
[ "$ok" = 1 ] || { docker logs --tail 40 "$CTR" 2>&1 || true; die "MSSQL did not become healthy in time."; }

# ---------------------------------------------------------------------------
# 4. create database + apply schema
# ---------------------------------------------------------------------------
log "Creating database '$DB'"
docker exec "$CTR" "$SQLCMD" -S localhost -U sa -P "$PW" -No \
  -Q "IF DB_ID('$DB') IS NULL CREATE DATABASE [$DB]"

log "Applying schema: $SCHEMA"
docker exec -i "$CTR" "$SQLCMD" -S localhost -U sa -P "$PW" -No -d "$DB" < "$SCHEMA"

# ---------------------------------------------------------------------------
# 5. reconnect the app replicas (recreate so they read the new DB + password)
# ---------------------------------------------------------------------------
log "Recreating app replicas so they connect to the fresh DB"
docker compose up -d --no-deps --force-recreate lg-magazine

log "Done. Final stack status:"
docker compose ps
