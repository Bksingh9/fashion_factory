#!/usr/bin/env bash
# scripts/bootstrap.sh — one-shot post-deploy bootstrap.
#
# Prereqs:
#   1. .env.local populated with real values for every required var
#      (see .env.example for the full list).
#   2. `pnpm install` already run.
#   3. You're logged into Supabase CLI: `pnpm dlx supabase@latest login`.
#
# What it does, in order:
#   1. Sanity-loads .env.local so the rest of the script can use the vars.
#   2. Links the Supabase project from .env.local.
#   3. Applies migrations 0001 → 0008 in order.
#   4. Provisions the 3 Stripe products + writes scripts/stripe.json.
#   5. Smoke-tests /healthz against the Vercel URL.
#   6. Reports the all-green / any-red verdict.
#
# Safe to re-run: every step is idempotent.

set -euo pipefail
shopt -s expand_aliases

if [[ ! -f .env.local ]]; then
  echo "✗ .env.local not found — copy .env.example and fill it first" >&2
  exit 1
fi

# Source .env.local into the shell so the supabase + stripe steps see it.
# Strip CRLFs, blank lines, and comments first.
set -a
# shellcheck disable=SC1090
. <(grep -v -E '^\s*(#|$)' .env.local | sed 's/\r$//')
set +a

required=(
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  STRIPE_SECRET_KEY
  NEXT_PUBLIC_APP_URL
)
missing=()
for v in "${required[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    missing+=("$v")
  fi
done
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "✗ .env.local missing required vars for bootstrap:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

# Derive project-ref from the Supabase URL: https://<ref>.supabase.co
ref="${NEXT_PUBLIC_SUPABASE_URL#https://}"
ref="${ref%%.supabase.co*}"
if [[ -z "$ref" || "$ref" == "$NEXT_PUBLIC_SUPABASE_URL" ]]; then
  echo "✗ Could not derive Supabase project-ref from NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL" >&2
  exit 1
fi

echo "==> Supabase: linking project $ref"
pnpm dlx supabase@latest link --project-ref "$ref"

echo "==> Supabase: applying migrations 0001..0008"
pnpm dlx supabase@latest db push

echo "==> Stripe: ensuring 3 products + writing scripts/stripe.json"
pnpm tsx scripts/setup-stripe.ts

if [[ -n "${NEXT_PUBLIC_APP_URL:-}" ]]; then
  echo "==> Smoke: GET ${NEXT_PUBLIC_APP_URL}/healthz"
  body="$(curl -s --max-time 15 "${NEXT_PUBLIC_APP_URL}/healthz" || true)"
  echo "$body"
  if echo "$body" | grep -q '"ok":true'; then
    echo "✓ healthz returned ok:true"
  else
    echo "△ healthz did not return ok:true — fill remaining provider keys to fully close /healthz"
  fi
fi

echo ""
echo "Bootstrap complete. Next:"
echo "  - pnpm dlx inngest-cli@latest dev  (in another terminal, for local dev)"
echo "  - Visit ${NEXT_PUBLIC_APP_URL}/login  to sign in via magic link"
echo "  - In Inngest, sync the App: URL = ${NEXT_PUBLIC_APP_URL}/api/inngest"
