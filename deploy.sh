#!/usr/bin/env bash
#
# deploy.sh — one-shot deploy for the `production` (MSSQL) branch.
#
# Idempotent & safe to re-run. It:
#   1. pulls the latest `production`
#   2. ensures the MSSQL_* keys exist in .env (without touching your app secrets)
#   3. builds the image and starts the stack (mssql + 3 app replicas)
#   4. waits for MSSQL to become healthy
#   5. creates the database + applies the v3_sessions schema (one-time, idempotent)
#   6. verifies the table and prints stack status
#
# Usage:
#   ./deploy.sh                       # interactive: prompts for SA password if unset
#   MSSQL_PASSWORD='Str0ngPass' ./deploy.sh   # non-interactive
#
# NOTE: .env is gitignored — secrets live only on the server, never in git.
# NOTE: real auth/LLM secrets (QRIUS_*, ADMIN_*, *_API_KEY) must already be in
#       .env. This script only adds the MSSQL_* block; it warns if auth is missing
#       or still in mock mode.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

ENV_FILE=".env"
SCHEMA_FILE="supabase/migrations/v3_sessions.mssql.sql"
DB_NAME="${MSSQL_DATABASE:-lg_magazine}"
DB_USER="${MSSQL_USER:-sa}"
SQLCMD="/opt/mssql-tools18/bin/sqlcmd"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 0. prerequisites
# ---------------------------------------------------------------------------
command -v docker >/dev/null            || die "docker not found"
docker compose version >/dev/null 2>&1  || die "docker compose v2 not found"
[ -f "$SCHEMA_FILE" ]                    || die "schema file missing: $SCHEMA_FILE (are you on the production branch?)"

# ---------------------------------------------------------------------------
# 1. sync source (git mode) or use files on disk (tarball / offline mode)
# ---------------------------------------------------------------------------
if [ -d .git ] && git rev-parse --git-dir >/dev/null 2>&1 && git remote get-url origin >/dev/null 2>&1; then
  log "Git repo detected — pulling latest production"
  git fetch origin
  git checkout production
  git pull --ff-only origin production || warn "git pull failed — continuing with files on disk"
else
  log "No git remote — tarball/offline mode, deploying the files in this directory"
fi

# ---------------------------------------------------------------------------
# 2. ensure MSSQL_* env (append-only; never clobber existing values)
# ---------------------------------------------------------------------------
log "Ensuring MSSQL keys in $ENV_FILE"
touch "$ENV_FILE"

add_if_missing() {  # key value
  local k="$1" v="$2"
  if grep -qE "^${k}=" "$ENV_FILE"; then
    echo "  keep   $k (already set)"
  else
    printf '%s=%s\n' "$k" "$v" >> "$ENV_FILE"
    echo "  add    $k"
  fi
}

# password: keep existing > env var > prompt > auto-generate (alphanumeric so it
# never breaks .env / compose substitution; upper+lower+digit meets SQL policy)
if ! grep -qE '^MSSQL_PASSWORD=' "$ENV_FILE"; then
  PW="${MSSQL_PASSWORD:-}"
  if [ -z "$PW" ] && [ -t 0 ]; then
    read -rsp "  Enter MSSQL SA password (blank = auto-generate): " PW; echo
  fi
  if [ -z "$PW" ]; then
    PW="Lg$(openssl rand -hex 12)X9"
    warn "Auto-generated SA password: $PW"
    warn "  -> saved to $ENV_FILE. STORE IT SOMEWHERE SAFE."
  fi
  printf 'MSSQL_PASSWORD=%s\n' "$PW" >> "$ENV_FILE"
  echo "  add    MSSQL_PASSWORD"
else
  echo "  keep   MSSQL_PASSWORD (already set)"
fi

add_if_missing MSSQL_DATABASE          "$DB_NAME"
add_if_missing MSSQL_USER              "$DB_USER"
add_if_missing MSSQL_ENCRYPT           "true"
add_if_missing MSSQL_TRUST_SERVER_CERT "true"

# effective password for sqlcmd
PW="$(grep -E '^MSSQL_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
[ -n "$PW" ] || die "MSSQL_PASSWORD is empty"

# sanity warnings (don't block deploy, but make footguns loud)
grep -qE '^QRIUS_MOCK=1' "$ENV_FILE"          && warn "QRIUS_MOCK=1 is set — that's MOCK auth, NOT real production login!"
grep -qE '^QRIUS_SESSION_SECRET=' "$ENV_FILE" || warn "QRIUS_SESSION_SECRET missing — every request will be 401 until set."
grep -qE '^ADMIN_PASSWORD=' "$ENV_FILE"       || warn "ADMIN_PASSWORD missing — /admin login will be unavailable."
grep -qE '^SUPABASE_' "$ENV_FILE"             && warn "Stale SUPABASE_* keys in .env — unused on production, safe to remove."

# is MSSQL containerized in this compose? (external-DB deploys skip DB bootstrap)
MSSQL_IN_COMPOSE=0
docker compose config --services 2>/dev/null | grep -qx mssql && MSSQL_IN_COMPOSE=1

# ---------------------------------------------------------------------------
# 3. build + start
# ---------------------------------------------------------------------------
log "Building image"
docker compose build

log "Starting stack"
docker compose up -d

# ---------------------------------------------------------------------------
# 4-6. DB bootstrap (only when MSSQL runs as a compose service)
# ---------------------------------------------------------------------------
if [ "$MSSQL_IN_COMPOSE" -eq 1 ]; then
  log "Waiting for MSSQL to become healthy"
  ok=0
  for _ in $(seq 1 60); do
    if docker compose ps mssql --format '{{.Status}}' 2>/dev/null | grep -q healthy; then ok=1; break; fi
    sleep 3
  done
  [ "$ok" -eq 1 ] || die "MSSQL did not become healthy in time (check: docker compose logs mssql)"

  log "Creating database '$DB_NAME' (if needed)"
  docker compose exec -T mssql "$SQLCMD" -S localhost -U "$DB_USER" -P "$PW" -No \
    -Q "IF DB_ID('$DB_NAME') IS NULL CREATE DATABASE [$DB_NAME];"

  log "Applying schema ($SCHEMA_FILE)"
  docker compose exec -T mssql "$SQLCMD" -S localhost -U "$DB_USER" -P "$PW" -No -d "$DB_NAME" \
    -i /dev/stdin < "$SCHEMA_FILE"

  log "Verifying v3_sessions table"
  docker compose exec -T mssql "$SQLCMD" -S localhost -U "$DB_USER" -P "$PW" -No -d "$DB_NAME" \
    -Q "SET NOCOUNT ON; SELECT CASE WHEN OBJECT_ID('dbo.v3_sessions') IS NULL THEN 'MISSING' ELSE 'OK' END AS v3_sessions;"
else
  warn "No 'mssql' service in compose — assuming EXTERNAL MSSQL."
  warn "Apply the schema yourself against MSSQL_SERVER:"
  warn "  sqlcmd -S \$MSSQL_SERVER -U \$MSSQL_USER -P \$MSSQL_PASSWORD -No -d $DB_NAME -i $SCHEMA_FILE"
fi

# ---------------------------------------------------------------------------
# done
# ---------------------------------------------------------------------------
log "Stack status"
docker compose ps

log "Deploy complete ✓  App replicas on 127.0.0.1:3002-3004 (nginx load-balances these)."
