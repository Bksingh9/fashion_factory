# PainPilot — Operations Runbook

Day-to-day procedures, incident response, and key rotations. Pairs with `docs/SETUP.md` (one-time service signup) and `CLAUDE.md` (the binding invariants).

---

## Daily operating

### Watching the system

| Surface | What you check |
|---|---|
| `https://<your-domain>/healthz` | Every external provider sub-check green (200) |
| Vercel Deployments | Last 24h: no failed builds, all status `Ready` |
| Inngest dashboard → painpilot | No accumulating failures on `crawl.run`, `signal.cluster`, `cluster.summarize` |
| Supabase → Reports | DB CPU < 50%, queries < 200ms p95 |
| Sentry (Phase 6.5) | Error rate < 0.5% (invariant §6) |
| Axiom (Phase 6.5) | Log volume not spiking; no LLM cache-hit < 55% alerts |

### Routine touches

- **Hourly cron** `product.metrics.snapshot` writes a `product_metrics` row per published product. If you see no rows for >2h, check Inngest for a stuck run.
- **Daily cron** `privacy.purge_authors` runs at 03:00 UTC. Inspect the Inngest run output: `purged > 0` is expected once you have signals older than 90 days in non-saved clusters.
- **Daily cron** `validate.competitor_refresh` at 04:00 UTC re-runs the competitors section on any draft spec older than 7 days.
- **Daily cron** `marketplace.affiliate_rotate` at 00:00 UTC rebalances `rotation_weight`.
- **Monthly cron** `payouts.compute` runs 06:00 UTC on the 1st. Manually inspect the resulting `payouts` rows before any actual Polar transfer.
- **5-min cron** `perf.budget.scan` writes to `perf_budget_violations` on any §6 budget breach. Triage any rows that appear.

---

## Incidents

### `/healthz` returns 503 with one provider sub-check `ok: false`

1. Identify the failing provider from the JSON.
2. Most likely: rotate the API key. Vercel → Project → Settings → Environment Variables → edit the matching var → Save → trigger a Redeploy.
3. After the redeploy, re-curl `/healthz`. If still failing, the provider has an outage — check their status page; consider toggling `LLM_STUB=1` only if traffic spike + outage coincide (and remember to revert).

### Inngest functions piling up "Failed"

1. Open Inngest dashboard → painpilot → **Failures**.
2. Click the first failed run → read the step that errored.
3. Common causes:
   - **LLM provider rate-limit** → bump `LLM_PLAN_LIMITS` if it's our caller, or wait out the upstream
   - **Supabase pool exhaustion** → check Supabase → Database → Connections; bump pool size in `db/service.ts` if needed (rare)
   - **Schema retry exhausted** → the LLM is returning unparseable JSON repeatedly; check the prompt body in the `prompts` table, may need a v2 (see "Rotating a prompt" below)
4. Click **Retry** on the run to re-process after the underlying issue is fixed.

### `/marketplace` TTFB > 200ms p95

1. The §6 budget is breaking. Check `perf_budget_violations` for the metric.
2. Likely causes:
   - ISR cache cold (`revalidate = 60`) — first hit per minute is uncached
   - Too many marketplace_listings — paginate via `limit` in `getFeatured()`
   - Vercel region drift — confirm `iad1` in `vercel.json`
3. Run `pnpm verify:phase7` to assert SSG-friendliness hasn't regressed.

### Crawler getting 403/429 from a source

1. Reddit: rotate `REDDIT_USER_AGENT` to a more descriptive one (Reddit blocks generic UAs); confirm `REDDIT_CLIENT_ID`/`SECRET` are valid.
2. Trustpilot/G2/Play Store (HTML scrapers): selectors may have drifted from the site's markup. Check `crawl_runs.error` for the row; update the cheerio selector in the matching `/src/server/sources/<name>.ts`.
3. The crawlers are defensive — they skip-on-failure rather than crash, so the rest of the pipeline keeps running.

### Stripe webhook signature failures

1. Confirm `STRIPE_WEBHOOK_SECRET` in Vercel matches the live signing secret in Stripe → Developers → Webhooks → your endpoint.
2. If you regenerate the secret, update Vercel + redeploy.
3. Test with `stripe trigger checkout.session.completed` from the Stripe CLI; tail Vercel function logs.

### GitHub webhook signature failures

1. `GITHUB_APP_WEBHOOK_SECRET` mismatch with the App settings. Re-paste from the App settings page.
2. Confirm the `Webhook URL` in GitHub App settings points at your live Vercel URL.

---

## Rotating credentials

### Any API key

1. Generate a new key in the provider's console.
2. Vercel → Project → Settings → Environment Variables → edit → paste new → Save.
3. Deployments → top-right `...` → **Redeploy** (uncheck "Use existing build cache").
4. Once deployed, revoke the old key in the provider's console.

### Supabase service-role key

Same as above, but extra care: the service-role bypasses RLS. After rotation, double-check that no log line shipped the old key — search Axiom for it (without the actual value; check by purpose strings like `prefix sk_` or `sb_`).

### Stripe webhook secret

1. Stripe Dashboard → Developers → Webhooks → your endpoint → Reveal signing secret → click "Roll".
2. Vercel: paste new `STRIPE_WEBHOOK_SECRET` → Redeploy.
3. The Upstash idempotency keys for the old events stay valid (they're event-id-based, not secret-based).

### GitHub App private key

1. GitHub App settings → Private keys → Generate a new private key.
2. Convert PEM newlines to `\n`: `awk '{printf "%s\\n", $0}' new-key.pem | pbcopy`.
3. Vercel: paste into `GITHUB_APP_PRIVATE_KEY` → Redeploy.
4. Delete the old private key in the GitHub App UI.

---

## Rotating a prompt

Prompts are **data**, not code (invariant §2). To ship a new prompt body without redeploying:

1. In Supabase SQL Editor:
   ```sql
   -- 1. INSERT a new version row, active=false
   insert into public.prompts (name, version, body, active) values
     ('extract.signals', 'v2', $body$<new prompt body>$body$, false);

   -- 2. After verifying via promptfoo eval, flip the active flag
   update public.prompts set active = false where name = 'extract.signals' and version = 'v1';
   update public.prompts set active = true  where name = 'extract.signals' and version = 'v2';
   ```
2. The next LLM call picks up `v2` via `getPrompt('extract.signals')` (60s in-memory cache invalidates after a minute, or via the Realtime channel if subscribed).
3. To roll back: flip `active` flags in reverse. Both versions persist.

---

## Rotating a model

Same pattern, different table:

```sql
-- Add the new model row, active=false
insert into public.models (provider, model, kind, input_per_1m, output_per_1m, context_window, supports_json, active) values
  ('anthropic', 'claude-3-7-sonnet-latest', 'premium', 3.0, 15.0, 200000, true, false);

-- Atomically swap the active row (partial unique index enforces only-one-active-per-kind)
begin;
update public.models set active = false where kind = 'premium' and active = true;
update public.models set active = true where provider = 'anthropic' and model = 'claude-3-7-sonnet-latest' and kind = 'premium';
commit;
```

The router reads the active row per kind from `models` on every call (60s cache); no redeploy needed.

---

## Releasing a new version

1. Land changes via PR. CI (`.github/workflows/verify.yml`) runs all 8 phase verifies + unit tests + typecheck + lint + build.
2. After merge to `main`, Vercel auto-deploys.
3. Tag the release: `git tag -a v1.0.2 -m "what changed"` → `git push origin v1.0.2`.
4. (Optional) Create a GitHub Release from the tag with the changelog.

---

## Local quickstart for a new contributor

```bash
git clone https://github.com/Bksingh9/fashion_factory.git
cd fashion_factory
pnpm install
cp .env.example .env.local
# fill values (see docs/SETUP.md)
./scripts/bootstrap.sh
pnpm dev                          # in one terminal
pnpm dlx inngest-cli@latest dev   # in another
```

`scripts/bootstrap.sh` covers: Supabase link + db push + Stripe products + healthz smoke.

---

## What I will NOT do (matches CLAUDE.md §9)

- Auto-post to Reddit, X, LinkedIn, Instagram, Threads, or any social network.
- Store financial account numbers, SSNs, or credit cards (Stripe Elements only).
- Log secrets or tokens (the `log()` helper scrubs them in Phase 6.5).
- Store Reddit usernames longer than 90 days unless the cluster has a `cluster_saves` row.
- Hardcode an LLM model name in feature code (models live in the `models` table).
- Call a provider SDK from outside `/src/server/`.

The CI guard `tests/unit/no_auto_post.test.ts` mechanically enforces the first one. The rest are honored by code review + the `pnpm verify:phaseN` chain.
