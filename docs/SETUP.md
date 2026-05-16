# PainPilot — Service Setup Walkthroughs

Paste-and-go forms for every external service Phase 0–7 depends on. Open each link, copy the field values verbatim where shown, and drop the resulting credentials into Vercel → Environment Variables.

Order matters only loosely. The minimum to see the app boot is **Supabase + Anthropic + Groq + Voyage + Upstash + Inngest + Resend**. The rest can land later (the corresponding feature won't work until you do, but the rest of the app keeps running).

---

## 1. Supabase

**URL:** https://supabase.com/dashboard

1. **New project** → name `painpilot`, region closest to your Vercel region (default `iad1` → pick `us-east-1`), strong DB password (save it).
2. After provision (~2 min):
   - **Project Settings → API** → copy `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - Copy `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Copy `service_role` key (under "Project API keys") → `SUPABASE_SERVICE_ROLE_KEY`
3. **Authentication → Providers** → enable **Email** (magic link) and **Google** (paste your Google OAuth credentials from https://console.cloud.google.com/apis/credentials).
4. **Authentication → URL Configuration** → set Site URL to your Vercel URL; add `https://<your-vercel-url>/auth/callback` to Redirect URLs.
5. Apply migrations locally (one time):
   ```bash
   pnpm dlx supabase@latest link --project-ref <your-ref>
   pnpm dlx supabase@latest db push
   ```

---

## 2. Reddit (script app, OAuth `client_credentials`)

**URL:** https://www.reddit.com/prefs/apps

Click **are you a developer? create an app** → fill:

| Field | Value |
|---|---|
| name | `painpilot` |
| type | **script** (radio button) |
| description | `PainPilot — read-only complaint crawler` |
| about url | `https://<your-vercel-url>` |
| redirect uri | `https://<your-vercel-url>/auth/callback` (required field; the `client_credentials` flow doesn't actually use it) |

Click **create app**.

- The string under "personal use script" (top-left of the app card) → `REDDIT_CLIENT_ID`
- The string next to "secret" → `REDDIT_CLIENT_SECRET`
- `REDDIT_USER_AGENT` → `painpilot/1.0 by <your-reddit-username>` (Reddit requires a real, descriptive UA; otherwise rate-limits hit hard)

---

## 3. Product Hunt (GraphQL API token)

**URL:** https://www.producthunt.com/v2/oauth/applications → **+ ADD AN APPLICATION**

| Field | Value |
|---|---|
| name | `painpilot` |
| redirect uri | `https://<your-vercel-url>/auth/callback` |

After create → **Create Token** (the "developer_token" path, not OAuth). The string is your `PRODUCT_HUNT_API_TOKEN`. Tokens expire in 30 days; rotate via the same UI.

---

## 4. Anthropic / Groq / Perplexity / Voyage / Cohere / OpenRouter

All follow the same shape — sign up, create API key, paste:

| Provider | Console URL | Free credit | Env var |
|---|---|---|---|
| Anthropic | https://console.anthropic.com/settings/keys | $5 trial | `ANTHROPIC_API_KEY` |
| Groq | https://console.groq.com/keys | Free, generous | `GROQ_API_KEY` |
| Perplexity | https://www.perplexity.ai/settings/api | $5 trial | `PERPLEXITY_API_KEY` |
| Voyage | https://dash.voyageai.com/api-keys | 50M tokens free | `VOYAGE_API_KEY` |
| Cohere | https://dashboard.cohere.com/api-keys | 1k calls/month free | `COHERE_API_KEY` |
| OpenRouter | https://openrouter.ai/settings/keys | Pay-as-you-go | `OPENROUTER_API_KEY` |

---

## 5. Brave Search

**URL:** https://api.search.brave.com/app/subscriptions/active

1. Subscribe to **Data for Search > Free** (2,000 queries/month).
2. Profile → **API Keys** → generate → `BRAVE_SEARCH_API_KEY`.

---

## 6. Upstash Redis

**URL:** https://console.upstash.com

1. **Create Database** → name `painpilot`, type **Regional**, region matching Vercel (`us-east-1`), **Free** tier.
2. After create → **REST API** tab:
   - `UPSTASH_REDIS_REST_URL` ← the `UPSTASH_REDIS_REST_URL` shown
   - `UPSTASH_REDIS_REST_TOKEN` ← the `UPSTASH_REDIS_REST_TOKEN` shown

---

## 7. Inngest

**URL:** https://app.inngest.com

1. **New app** → name `painpilot`.
2. **Apps → painpilot → Sync new app** → URL `https://<your-vercel-url>/api/inngest`. Click sync. Inngest discovers all 18 functions automatically.
3. **Manage → Event Keys** → create one → `INNGEST_EVENT_KEY`.
4. **Manage → Signing Key** → copy `INNGEST_SIGNING_KEY`.

---

## 8. Stripe (test mode)

**URL:** https://dashboard.stripe.com/test

1. **Developers → API keys**:
   - `Publishable key` → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - `Secret key` → `STRIPE_SECRET_KEY`
2. Run the products bootstrap from your local clone (creates Pro/Studio/Agency products + writes the IDs to `scripts/stripe.json` — commit that):
   ```bash
   STRIPE_SECRET_KEY=sk_test_... pnpm tsx scripts/setup-stripe.ts
   ```
3. **Developers → Webhooks → Add endpoint**:
   - URL `https://<your-vercel-url>/api/stripe/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Signing secret → `STRIPE_WEBHOOK_SECRET`

Test card for local Stripe flows: `4242 4242 4242 4242`, any future date, any CVC, any ZIP.

---

## 9. Polar

**URL:** https://polar.sh/dashboard

1. **Create organization** → name `painpilot`.
2. **Settings → Access Tokens → Create** → scope: `organizations:write,products:write,subscriptions:read,checkouts:write,webhooks:read_write` → `POLAR_ACCESS_TOKEN`.
3. Organization slug from the URL → `POLAR_ORG_ID`.
4. **Settings → Webhooks → Add**:
   - URL `https://<your-vercel-url>/api/polar/webhook`
   - Events: `subscription.created`, `subscription.updated`, `subscription.canceled`
   - Signing secret → `POLAR_WEBHOOK_SECRET`

---

## 10. Resend

**URL:** https://resend.com/api-keys

1. Create API key → `RESEND_API_KEY`.
2. **Domains → Add domain** → enter your sending domain (e.g. `painpilot.dev`).
3. Add the DNS records Resend shows (SPF, DKIM, DMARC) to your DNS provider. Wait for "Verified".
4. `FROM_EMAIL` = `hello@<your-domain>` (must use the verified domain).

For staging you can skip the domain step and use Resend's `onboarding@resend.dev` sender — set `FROM_EMAIL=onboarding@resend.dev`.

---

## 11. GitHub App (Phase 4 Ship)

**URL:** https://github.com/settings/apps/new

Fill these fields exactly:

| Field | Value |
|---|---|
| GitHub App name | `painpilot-<your-username>` (must be unique across GitHub) |
| Homepage URL | `https://<your-vercel-url>` |
| Webhook → Active | ✅ checked |
| Webhook URL | `https://<your-vercel-url>/api/github/webhook` |
| Webhook secret | generate a 32-char random string → `GITHUB_APP_WEBHOOK_SECRET` |
| Repository permissions → **Administration** | **Read & write** (needed for `createRepoFromTemplate`) |
| Repository permissions → **Contents** | **Read & write** (Git Data API for `commitTree`) |
| Repository permissions → **Metadata** | **Read** (default) |
| Repository permissions → **Actions** | **Read & write** (enable Actions on shipped repos) |
| Subscribe to events | `push`, `check_run`, `installation` |
| Where can this be installed? | **Only on this account** (or Any account if you want a public marketplace) |

After create:

- **App ID** (top of the page, numeric) → `GITHUB_APP_ID`
- **Client ID** / **Client secret** (in OAuth section, click Generate a new client secret) → `GITHUB_APP_CLIENT_ID` / `GITHUB_APP_CLIENT_SECRET`
- **Private keys** → **Generate a private key** → downloads a `.pem` file. Open it, **replace literal newlines with `\n`** so it's one line, paste into `GITHUB_APP_PRIVATE_KEY`:
   ```bash
   # quick converter:
   awk '{printf "%s\\n", $0}' painpilot.<id>.private-key.pem | pbcopy
   ```
- **Install App** → install onto your account → grant access to **All repositories** (or pick the ones you want PainPilot to ship into).

The installation also lands a row in PainPilot's `github_installations` table once the user visits `/app/github/install` and the install completes.

---

## 12. Observability (Phase 6 — fine to defer with `OBSERVABILITY_STUB=1`)

When you're ready:

| Provider | Where | Vars |
|---|---|---|
| Sentry | https://sentry.io → new Next.js project | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` |
| PostHog | https://posthog.com → new project | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` |
| Axiom | https://app.axiom.co → create dataset `painpilot` + API token | `AXIOM_TOKEN`, `AXIOM_DATASET=painpilot` |
| Langfuse | https://cloud.langfuse.com → new project | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST=https://cloud.langfuse.com` |

Until then, set:
```
OBSERVABILITY_STUB=1
```
in Vercel env. Every observability call no-ops (with a loud log line) and the interfaces stay stable.

---

## 13. Final post-deploy checklist

After every env var is filled and migrations are applied, hit these in order:

1. `curl https://<your-vercel-url>/healthz` → expect `200` with every sub-check `ok: true`.
2. **Inngest dashboard → painpilot → Invoke → `crawl.scheduler`** with `{}` → wait 60s.
3. `https://<your-vercel-url>/app` → cluster cards appear.
4. Save a cluster → `/app/clusters/<id>/validate` → **Generate all sections** → **Lock spec**.
5. `/app/clusters/<id>/ship` → **Ship to GitHub** → watch `ship.run` in Inngest → repo appears on your GitHub.
6. `/app/billing` → Pro plan → Stripe test card `4242 4242 4242 4242` → plan badge flips.
7. Toggle `products.status='public'` for a ship → `/marketplace` lists it.

That's the loop end to end.

---

## Troubleshooting cheatsheet

| Symptom | Likely cause |
|---|---|
| `/healthz` returns 503 with one provider failing | Wrong / missing API key for that provider |
| Inngest functions don't show up | App not synced; run **Sync new app** with `/api/inngest` URL |
| Stripe webhook 400s | `STRIPE_WEBHOOK_SECRET` doesn't match the live signing secret; rotate + redeploy |
| `Ship to GitHub` button absent | No `github_installations` row for the user; visit `/app/github/install` first |
| Cluster cards never appear | `signal.embed` or `signal.cluster` failing in Inngest; check the function runs for the actual error |
| `/app` redirects to /login in a loop | Supabase Auth URL Configuration missing `<vercel-url>/auth/callback` |
