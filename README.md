# PainPilot

> Opportunity OS — turn internet complaints into shipped, paying AI micro-SaaS.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FBksingh9%2Ffashion_factory&project-name=painpilot&repository-name=painpilot&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,ANTHROPIC_API_KEY,GROQ_API_KEY,PERPLEXITY_API_KEY,VOYAGE_API_KEY,COHERE_API_KEY,OPENROUTER_API_KEY,BRAVE_SEARCH_API_KEY,STRIPE_SECRET_KEY,STRIPE_WEBHOOK_SECRET,NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,POLAR_ACCESS_TOKEN,POLAR_WEBHOOK_SECRET,UPSTASH_REDIS_REST_URL,UPSTASH_REDIS_REST_TOKEN,INNGEST_EVENT_KEY,INNGEST_SIGNING_KEY,RESEND_API_KEY,FROM_EMAIL,LANGFUSE_PUBLIC_KEY,LANGFUSE_SECRET_KEY,LANGFUSE_HOST,AXIOM_TOKEN,AXIOM_DATASET,SENTRY_DSN,NEXT_PUBLIC_SENTRY_DSN,NEXT_PUBLIC_POSTHOG_KEY,NEXT_PUBLIC_POSTHOG_HOST,NEXT_PUBLIC_APP_URL,REDDIT_USER_AGENT,REDDIT_CLIENT_ID,REDDIT_CLIENT_SECRET,PRODUCT_HUNT_API_TOKEN,GITHUB_APP_ID,GITHUB_APP_PRIVATE_KEY,GITHUB_APP_CLIENT_ID,GITHUB_APP_CLIENT_SECRET,GITHUB_APP_WEBHOOK_SECRET&envDescription=37%20required%20vars%20%2B%20optional%20Vercel%2FStaging%2FEval%20knobs.%20See%20.env.example%20for%20comments%20and%20signup%20URLs.&envLink=https%3A%2F%2Fgithub.com%2FBksingh9%2Ffashion_factory%2Fblob%2Fv1.0.0%2F.env.example)

## What this is

PainPilot is a vertically integrated workbench for solo founders. It listens
to public complaints across Reddit, Hacker News, Product Hunt, app-store
reviews, Trustpilot, G2, and Indie Hackers; clusters them into validated
demand signals; helps you spec, validate, and ship a focused MVP; then
deploys it under your account and meters usage for revenue share.

The end-to-end loop:

1. **Listen** — crawlers collect public complaints (read-only; never post).
2. **Cluster** — embedding + rerank pipelines surface shared pain points.
3. **Validate** — LLM-generated spec, pricing, and go-to-market hypothesis.
4. **Ship** — code generation into a fresh GitHub repo deployed via the
   PainPilot GitHub App.
5. **Operate** — Stripe + Polar handle subscriptions and marketplace payouts;
   founders keep ownership of their code, customers, and brand.

## Run locally

Prerequisites: **Node 20+** and **pnpm 10+**.

```bash
pnpm install
cp .env.example .env.local       # fill in real values; see docs/SETUP.md
./scripts/bootstrap.sh            # supabase link + db push + stripe products + healthz smoke
pnpm dev                          # next dev on http://localhost:3000
```

Useful scripts:

```bash
pnpm typecheck                   # tsc --noEmit
pnpm lint                        # eslint (no `any`, no @ts-ignore, no `as unknown as`)
pnpm test                        # vitest
pnpm test:e2e                    # playwright tests
pnpm verify:phase0               # programmatic phase exit-criteria check
```

Health check while running:

```bash
curl http://localhost:3000/healthz
```

The healthz route pings every upstream provider in parallel and returns
`{ok, checks}`. If you don't have credentials for every provider yet (you
won't, until you sign up below), set `HEALTHZ_STUB=1` in `.env.local` — every
sub-check will fake a 200ms-ish green response, and the route will log a loud
warning every time it does. **Never set `HEALTHZ_STUB` in production.**

## Deploy

PainPilot is designed to deploy to **Vercel** with Supabase, Upstash, Inngest,
Stripe, Polar, Resend, Langfuse, Axiom, Sentry, and PostHog as managed
upstream services.

1. Push the repo to GitHub.
2. Create a new Vercel project pointing at this repo. Use the **Node 20**
   runtime. Build command: `pnpm build`. Output: default.
3. Add every variable from `.env.example` to the Vercel project's environment.
   Mark `NEXT_PUBLIC_*` vars as available to Preview + Production; mark all
   others as Production-only or Production+Preview as appropriate.
4. Register the Stripe webhook at `https://<your-domain>/api/webhooks/stripe`
   and paste the signing secret into `STRIPE_WEBHOOK_SECRET`.
5. Register the GitHub App webhook at `https://<your-domain>/api/webhooks/github`.
6. Register the Polar webhook at `https://<your-domain>/api/webhooks/polar`.
7. In Inngest, point the app URL at `https://<your-domain>/api/inngest` and
   sync once. Cron schedules are defined as Inngest functions; **do not use
   Vercel cron** except for the shallow `/healthz` ping.
8. Verify deployment by hitting `https://<your-domain>/healthz` — every
   sub-check should be green.

## Provider signup links

Sign up for each of these and populate the matching var in `.env.local`. The
free tiers are sufficient for development.

- **Supabase** — https://supabase.com → `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Anthropic** (Claude) — https://console.anthropic.com → `ANTHROPIC_API_KEY`.
- **Groq** — https://console.groq.com → `GROQ_API_KEY`.
- **Perplexity** — https://www.perplexity.ai/settings/api → `PERPLEXITY_API_KEY`.
- **Voyage AI** — https://dash.voyageai.com → `VOYAGE_API_KEY`.
- **Cohere** — https://dashboard.cohere.com → `COHERE_API_KEY`.
- **OpenRouter** — https://openrouter.ai → `OPENROUTER_API_KEY`.
- **Brave Search API** — https://api.search.brave.com → `BRAVE_SEARCH_API_KEY`.
- **Stripe** — https://dashboard.stripe.com → `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
- **Polar** — https://polar.sh → `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`.
- **Upstash Redis** — https://console.upstash.com → `UPSTASH_REDIS_REST_URL`,
  `UPSTASH_REDIS_REST_TOKEN`.
- **Inngest** — https://app.inngest.com → `INNGEST_EVENT_KEY`,
  `INNGEST_SIGNING_KEY`.
- **Resend** — https://resend.com → `RESEND_API_KEY`, plus a verified
  `FROM_EMAIL`.
- **Langfuse** — https://cloud.langfuse.com → `LANGFUSE_PUBLIC_KEY`,
  `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`.
- **Axiom** — https://app.axiom.co → `AXIOM_TOKEN`, `AXIOM_DATASET`.
- **Sentry** — https://sentry.io → `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`.
- **PostHog** — https://posthog.com → `NEXT_PUBLIC_POSTHOG_KEY`,
  `NEXT_PUBLIC_POSTHOG_HOST`.
- **GitHub App** — https://github.com/settings/apps → `GITHUB_APP_ID`,
  `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`,
  `GITHUB_APP_WEBHOOK_SECRET`. Install the app on the orgs/users you want to
  ship into.
- **Reddit** — no signup required for read-only access. Set `REDDIT_USER_AGENT`
  to something like `painpilot/0.1 by <your-username>` per Reddit's API rules.

## Security

Security contact: see `/.well-known/security.txt` or
[security@painpilot.dev](mailto:security@painpilot.dev).
