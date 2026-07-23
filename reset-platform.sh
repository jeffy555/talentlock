#!/usr/bin/env bash
# Wipe Neon DB, delete all Clerk users, re-seed demo freelancers.
# Requires DATABASE_URL and CLERK_SECRET_KEY in .env (repo root).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ "${1:-}" != "--confirm" ]]; then
  echo "This will DELETE all DB data and ALL Clerk users, then re-seed demo freelancers."
  echo ""
  echo "Run:"
  echo "  ./reset-platform.sh --confirm"
  echo ""
  echo "Or:"
  echo "  pnpm --filter @workspace/scripts run reset-platform -- --confirm"
  exit 1
fi

pnpm --filter @workspace/scripts run reset-platform -- --confirm
