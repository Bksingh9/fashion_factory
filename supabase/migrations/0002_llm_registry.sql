-- 0002_llm_registry.sql — LLM models registry, prompts registry, traces, github installs.
--
-- The router reads `models` by `kind` to pick the active provider+model at
-- call time. Toggling `active` switches behaviour with no deploy. Prompts
-- versioned by (name, version); router picks active=true.
-- Traces are append-only per call.

-- ---- models ----
create table if not exists public.models (
  id               uuid primary key default gen_random_uuid(),
  provider         text not null,
  model            text not null,
  kind             text not null check (kind in ('hot', 'premium', 'research', 'embed', 'rerank')),
  input_per_1m     numeric(12, 4),
  output_per_1m    numeric(12, 4),
  context_window   integer,
  supports_json    boolean not null default false,
  supports_tools   boolean not null default false,
  supports_vision  boolean not null default false,
  supports_caching boolean not null default false,
  quality_score    numeric(4, 2),
  latency_p50      integer,
  active           boolean not null default false,
  deprecated_at    timestamptz,
  created_at       timestamptz not null default now(),
  unique (provider, model, kind)
);

-- At most one active row per kind. Enforced by partial unique index.
create unique index if not exists models_active_per_kind_uniq
  on public.models (kind)
  where active = true;

alter table public.models enable row level security;

-- Read access for any authenticated user (router needs it).
drop policy if exists "models authenticated read" on public.models;
create policy "models authenticated read"
  on public.models for select
  to authenticated
  using (true);

-- ---- prompts ----
create table if not exists public.prompts (
  name        text not null,
  version     text not null,
  body        text not null,
  schema_json jsonb,
  active      boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (name, version)
);

-- At most one active version per prompt name.
create unique index if not exists prompts_active_per_name_uniq
  on public.prompts (name)
  where active = true;

alter table public.prompts enable row level security;

drop policy if exists "prompts authenticated read" on public.prompts;
create policy "prompts authenticated read"
  on public.prompts for select
  to authenticated
  using (true);

-- ---- llm_traces ----
create table if not exists public.llm_traces (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles(id) on delete set null,
  purpose         text not null,
  provider        text not null,
  model           text not null,
  prompt_name     text,
  prompt_version  text,
  prompt_hash     text,
  input_tokens    integer,
  output_tokens   integer,
  cost_usd        numeric(12, 6),
  latency_ms      integer,
  cache_hit       boolean not null default false,
  score           numeric(4, 2),
  trace_id        text,
  created_at      timestamptz not null default now()
);

create index if not exists llm_traces_user_created_idx
  on public.llm_traces (user_id, created_at desc);
create index if not exists llm_traces_purpose_created_idx
  on public.llm_traces (purpose, created_at desc);

alter table public.llm_traces enable row level security;

drop policy if exists "llm_traces self read" on public.llm_traces;
create policy "llm_traces self read"
  on public.llm_traces for select
  using (user_id = (select auth.uid()));

-- ---- github_installations ----
create table if not exists public.github_installations (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  installation_id bigint not null,
  created_at      timestamptz not null default now()
);

create index if not exists github_installations_installation_idx
  on public.github_installations (installation_id);

alter table public.github_installations enable row level security;

drop policy if exists "github_installations self read" on public.github_installations;
create policy "github_installations self read"
  on public.github_installations for select
  using (user_id = (select auth.uid()));

-- ============================================================================
-- SEEDS
-- ============================================================================
-- Pricing sourced 2026-01 from each provider's public pricing page.
-- Refresh whenever a provider announces a price change.
-- Pricing rows can be updated in-place; the router reads them on every call
-- (subject to the in-memory 60s cache invalidated by realtime).
-- ============================================================================

-- HOT — Groq Llama 3.3 70B Versatile.
-- Source: https://groq.com/pricing/ (2026-01 snapshot: $0.59 in / $0.79 out per 1M).
insert into public.models
  (provider, model, kind, input_per_1m, output_per_1m, context_window,
   supports_json, supports_tools, supports_caching, quality_score, latency_p50, active)
values
  ('groq', 'llama-3.3-70b-versatile', 'hot', 0.59, 0.79, 131072,
   true, true, false, 7.5, 350, true)
on conflict (provider, model, kind) do nothing;

-- PREMIUM — Anthropic Claude 3.5 Sonnet.
-- Source: https://www.anthropic.com/pricing (2026-01: $3 in / $15 out per 1M).
-- NOTE: the phase prompt explicitly named claude-3-5-sonnet-latest. A newer
-- Sonnet (4.x) is available — swap the `model` and toggle `active` to switch.
insert into public.models
  (provider, model, kind, input_per_1m, output_per_1m, context_window,
   supports_json, supports_tools, supports_vision, supports_caching, quality_score, latency_p50, active)
values
  ('anthropic', 'claude-3-5-sonnet-latest', 'premium', 3.0, 15.0, 200000,
   true, true, true, true, 9.0, 900, true)
on conflict (provider, model, kind) do nothing;

-- RESEARCH — Perplexity Sonar.
-- Source: https://docs.perplexity.ai/guides/pricing (2026-01: $1 in / $1 out per 1M).
insert into public.models
  (provider, model, kind, input_per_1m, output_per_1m, context_window,
   supports_json, quality_score, latency_p50, active)
values
  ('perplexity', 'sonar', 'research', 1.0, 1.0, 127000,
   false, 7.5, 1800, true)
on conflict (provider, model, kind) do nothing;

-- EMBED — Voyage voyage-3-large.
-- Source: https://docs.voyageai.com/docs/pricing (2026-01: $0.18 per 1M tokens, no output cost).
insert into public.models
  (provider, model, kind, input_per_1m, output_per_1m, context_window,
   quality_score, latency_p50, active)
values
  ('voyage', 'voyage-3-large', 'embed', 0.18, 0, 32000,
   8.5, 120, true)
on conflict (provider, model, kind) do nothing;

-- RERANK — Cohere Rerank 3.
-- Source: https://cohere.com/pricing (2026-01: $1 per 1k searches; treated as input_per_1m=1000 for simple cost calc).
insert into public.models
  (provider, model, kind, input_per_1m, output_per_1m, context_window,
   quality_score, latency_p50, active)
values
  ('cohere', 'rerank-3', 'rerank', 1000.0, 0, 4096,
   8.0, 140, true)
on conflict (provider, model, kind) do nothing;

-- ============================================================================
-- Prompt placeholders. Real bodies land in Phase 2+.
-- ============================================================================
insert into public.prompts (name, version, body, active)
values
  ('extract.signals',       'v1', 'TBD, see Phase 2+', true),
  ('cluster.summarize',     'v1', 'TBD, see Phase 2+', true),
  ('validate.audience',     'v1', 'TBD, see Phase 2+', true),
  ('validate.competitors',  'v1', 'TBD, see Phase 2+', true),
  ('spec.generate',         'v1', 'TBD, see Phase 2+', true),
  ('launch.product_hunt',   'v1', 'TBD, see Phase 2+', true),
  ('launch.x_thread',       'v1', 'TBD, see Phase 2+', true),
  ('launch.reddit_replies', 'v1', 'TBD, see Phase 2+', true),
  ('launch.cold_email',     'v1', 'TBD, see Phase 2+', true),
  ('launch.landing_page',   'v1', 'TBD, see Phase 2+', true)
on conflict (name, version) do nothing;
