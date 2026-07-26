#!/usr/bin/env bash
#
# Creates every Cloudflare resource Auxilium needs and prints the exact
# wrangler.toml block to paste back.
#
# Idempotent: re-running is safe. Resources that already exist are reported
# rather than duplicated, so this doubles as a "what does this account have"
# check.
#
# Usage:
#   bun run cf:setup          # or: bash scripts/cloudflare-setup.sh
#
# Prerequisites: wrangler authenticated (`npx wrangler login`, or CLOUDFLARE_API_TOKEN
# plus CLOUDFLARE_ACCOUNT_ID in the environment for CI).

set -uo pipefail

WRANGLER="npx wrangler"

D1_DEV="auxilium-db-dev"
D1_PROD="auxilium-db-prod"
R2_DEV="auxilium-documents-dev"
R2_PROD="auxilium-documents-prod"
KV_NAMESPACES=(AUXILIUM_CACHE_DEV AUXILIUM_CACHE_PROD AUXILIUM_CONFIG_DEV AUXILIUM_CONFIG_PROD)
# Dev/preview share one set; production has its own, mirroring the D1/R2/KV
# split. A Cloudflare queue has exactly one consumer, so a shared set lets the
# most recently deployed Worker consume every other environment's jobs.
QUEUES=(
  auxilium-imports auxilium-signals auxilium-imports-dlq auxilium-signals-dlq
  auxilium-imports-prod auxilium-signals-prod
  auxilium-imports-prod-dlq auxilium-signals-prod-dlq
)

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
ok()    { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn()  { printf '  \033[33m!\033[0m %s\n' "$*"; }

bold "Checking authentication"
if ! $WRANGLER whoami 2>&1 | grep -qiE "account|email"; then
  warn "Not authenticated. Run: npx wrangler login"
  warn "For CI, set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID instead."
  exit 1
fi
ok "authenticated"
echo

bold "D1 databases"
for db in "$D1_DEV" "$D1_PROD"; do
  output=$($WRANGLER d1 create "$db" 2>&1)
  if echo "$output" | grep -qi "already exists"; then
    warn "$db already exists — reusing"
  else
    ok "created $db"
  fi
  # Print the ID either way, so the toml block below is always complete.
  $WRANGLER d1 info "$db" 2>/dev/null | grep -iE "uuid|database_id" || true
done
echo

bold "R2 buckets"
for bucket in "$R2_DEV" "$R2_PROD"; do
  output=$($WRANGLER r2 bucket create "$bucket" 2>&1)
  if echo "$output" | grep -qi "already exists"; then
    warn "$bucket already exists — reusing"
  else
    ok "created $bucket"
  fi
done
echo

bold "KV namespaces"
for ns in "${KV_NAMESPACES[@]}"; do
  output=$($WRANGLER kv namespace create "$ns" 2>&1)
  if echo "$output" | grep -qi "already exists"; then
    warn "$ns already exists — reusing"
  else
    ok "created $ns"
  fi
  echo "$output" | grep -oE '"?id"?\s*=?:?\s*"[a-f0-9]{32}"' || true
done
echo

bold "Queues"
# Queues require a paid Workers plan. If creation fails with a billing error,
# that is the reason — everything else in Auxilium still works, because both
# producers degrade to running the job inline.
for queue in "${QUEUES[@]}"; do
  output=$($WRANGLER queues create "$queue" 2>&1)
  if echo "$output" | grep -qi "already exists"; then
    warn "$queue already exists — reusing"
  elif echo "$output" | grep -qiE "billing|plan|not entitled|upgrade"; then
    warn "$queue could not be created — Queues needs a paid Workers plan."
    warn "  Auxilium runs without it: imports commit inline and signals"
    warn "  recompute inline. Create it later in the dashboard under"
    warn "  Workers & Pages → Queues, with this exact name."
  else
    ok "created $queue"
  fi
done
echo

bold "Next steps"
cat <<'INSTRUCTIONS'
  1. Copy the IDs printed above into wrangler.toml — replace every
     database_id and every kv_namespaces id, in all three environment
     blocks (top level, [env.preview], [env.production]).

  2. Set the production secrets:
       npx wrangler secret put JWT_SECRET     --env production
       npx wrangler secret put SESSION_SECRET --env production
       # optional, enables AI-drafted triage notes:
       npx wrangler secret put ANTHROPIC_API_KEY --env production

  3. Apply migrations:
       bun run db:migrate:remote      # dev database
       bun run db:migrate:prod        # production database

  4. Seed the demo ministry (NEVER against production):
       bun run db:seed:remote

  5. Deploy:
       bun run deploy:preview
       bun run deploy:production

  Full walkthrough, including troubleshooting: docs/cloudflare-setup.md
INSTRUCTIONS
