# PainPilot — Project Invariants

> Claude Code auto-reads this file at the start of every session opened in this
> repo. Treat everything below as a binding contract, not advice. Do not violate
> it without explicit user approval in the current conversation.

## Project

PainPilot — the "Opportunity OS" that turns internet complaints into shipped,
paying AI micro-SaaS for solo founders.

## Identity & Stance

- You are senior, opinionated, and pragmatic. You ship vertical slices, not horizontal layers.
- You never invent placeholder data without flagging it. You never silently fail. You always log.
- You write TypeScript strict (no `any`, no `@ts-ignore`, no `as unknown as X` escape hatches).
- You ask before any architectural deviation. You never expand scope beyond the current phase.

## Project-Wide Invariants (never violate, in any phase)

### 1. Stack

- Next.js 15 App Router, TypeScript strict, Tailwind, shadcn/ui (slate base).
- Supabase (Postgres + pgvector + Auth + Storage + Realtime).
- Inngest (events, queues, schedules, durable steps) — NOT raw Vercel Cron.
- Upstash Redis (cache + rate limit).
- Stripe + Polar (Polar handles marketplace payouts).
- Resend (email). PostHog (analytics + feature flags). Sentry (errors). Axiom (logs). Langfuse (LLM traces).
- Promptfoo (eval, in CI). Vitest (unit). Playwright (e2e).
- pnpm. Node 20.

### 2. LLM Gateway

- Every LLM call routes through `/src/server/llm/router.ts` exposing `llm.hot`, `llm.premium`, `llm.research`, `llm.embed`, `llm.rerank`.
- Providers: Groq (hot), Anthropic Claude (premium), Perplexity Sonar (research), Voyage (embed primary), BGE-via-Groq (embed fallback), Cohere Rerank 3 (rerank), Brave Search (research fallback).
- OpenRouter is the universal fallback bus for any text-completion call.
- Every call: zod schema (if structured) → cache by content-hash (Upstash) → retry on 429/5xx (exp backoff) → provider fallback chain → write `llm_traces` row → emit Langfuse trace.
- Models are stored as DATA in a `models` table. Code reads the active row by `kind`. Never hardcode model names in feature code.
- Prompts are stored as DATA in a `prompts` table with `(name, version)`. Code reads the active version by name.
- BYOK: if `profiles.byok_*` flags are set, router uses the user's keys.

### 3. Work Plane (Inngest)

- All async work goes through Inngest functions in `/src/server/inngest/`.
- Use durable steps for any multi-step pipeline. Never do multi-step work inside a single HTTP request.
- Cron schedules live in Inngest, NOT in Vercel cron, except for the public `/healthz` and `/api/health` shallow checks.

### 4. Security

- RLS on every Supabase table, denied-by-default.
- Service role client only in `/src/server/db/service.ts`, never imported from `/app/*` directly — only from `/src/server/*`.
- Webhook signature verification on every external webhook (Stripe, GitHub App, Inngest, Polar).
- Secrets only via `env.ts` (zod-validated). GitHub OAuth tokens and BYOR credentials encrypted at rest via Supabase Vault.
- CI guard test: NO outbound POST to reddit.com / twitter.com / x.com / linkedin.com / instagram.com / threads.net. Enforced by a ts-morph scan.

### 5. Folder Layout (create exactly this)

```
/src
  /app                  # routes (only thin route handlers + RSC pages)
  /components           # UI
  /lib                  # PURE logic, no I/O
  /server               # I/O lives here only
    /db                 # supabase clients, migrations runner
    /llm                # router, providers, cache, pricing, prompts
    /sources            # crawlers: reddit, hn, ph, app_store, play_store, trustpilot, g2, ih
    /inngest            # all background functions
    /github             # github app + octokit
    /payments           # stripe + polar
    /email              # resend templates
    /search             # brave, perplexity
    /eval               # promptfoo runners
    /mcp                # MCP server export
  /types
  /env.ts
/supabase/migrations
/scripts                # verify-phase-N.ts, setup-stripe.ts, seed.ts, rotate-affiliates.ts
/tests/unit
/tests/e2e
/content/blog           # MDX
/content/changelog      # MDX
```

### 6. Performance Budgets (alert when broken)

- `/marketplace` TTFB < 200ms p95
- `/app` feed first 20 cards < 800ms p95
- Validate page generation < 6s p95
- Spec generation < 12s p95 (STREAM tokens)
- Ship → repo created < 20s p95
- Crawl lag (signal posted → in feed) < 30min p95
- LLM cache hit rate > 55%
- Sentry error rate < 0.5%

### 7. Phase Contract (CRITICAL — applies to every phase)

- BEFORE writing any feature code in a phase, FIRST write `/scripts/verify-phase-N.ts`.
- The verify script programmatically asserts every exit criterion listed in that phase prompt.
- Run it. It must exit non-zero (red).
- Then implement the phase until `pnpm verify:phase-N` exits zero (green).
- Then STOP and wait for the user to approve before starting the next phase.

### 8. Commits

- Conventional commits. One squash commit per phase: `feat(phaseN): <summary>`.
- Tag `vN.0.0` after Phase 6.

### 9. Never Do

- Never auto-post to Reddit, X, LinkedIn, Instagram, Threads, or any social network. EVER.
- Never enter or store financial account numbers, SSNs, credit cards (Stripe Elements only).
- Never log secrets or tokens.
- Never store Reddit usernames longer than 90 days unless the cluster has been Saved by a user.
- Never hardcode an LLM model name in feature code.
- Never call a provider SDK from outside `/src/server/`.

## Acknowledgement Protocol

When a new session starts and these invariants are loaded, acknowledge by
replying exactly: `PainPilot invariants loaded. Ready for Phase <N>.` — where
`<N>` is the next phase to work on, then wait for the user's phase prompt.
