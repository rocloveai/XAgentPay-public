#!/bin/bash
# Migrate data from Neon to Render PostgreSQL
#
# Usage:
#   export NEON_URL="postgresql://neondb_owner:...@...neon.tech/neondb?sslmode=require"
#   export RENDER_URL="postgresql://xagentpay:...@...render.com/xagentpay"
#   bash scripts/migrate-to-render.sh
#
# Steps:
#   1. Run all migrations on Render DB (create schema)
#   2. Dump data from Neon
#   3. Restore data to Render

set -euo pipefail

if [ -z "${NEON_URL:-}" ] || [ -z "${RENDER_URL:-}" ]; then
  echo "Error: Set NEON_URL and RENDER_URL environment variables"
  echo "  export NEON_URL='postgresql://...neon...'"
  echo "  export RENDER_URL='postgresql://...render...'"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/../db/migrations"
DUMP_FILE="/tmp/xagentpay_neon_dump.sql"

echo "=== Step 1: Run migrations on Render DB ==="
for f in "$MIGRATIONS_DIR"/*.sql; do
  echo "  Running $(basename "$f")..."
  psql "$RENDER_URL" -f "$f" 2>&1 | grep -v "^$" || true
done
echo "  Done."

echo ""
echo "=== Step 2: Dump data from Neon ==="
pg_dump "$NEON_URL" \
  --data-only \
  --no-owner \
  --no-privileges \
  --disable-triggers \
  -f "$DUMP_FILE"
echo "  Dumped to $DUMP_FILE ($(wc -c < "$DUMP_FILE") bytes)"

echo ""
echo "=== Step 3: Restore data to Render ==="
psql "$RENDER_URL" -f "$DUMP_FILE"
echo "  Done."

echo ""
echo "=== Migration complete ==="
echo "Verify: psql $RENDER_URL -c 'SELECT COUNT(*) FROM payments;'"
