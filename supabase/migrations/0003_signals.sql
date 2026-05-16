-- 0003_signals.sql — PainPilot Phase 2 schema (Listen + Cluster).
--
-- Adds the per-source registry (crawl_sources), per-run observability
-- (crawl_runs), the raw signal rows (signals), the demand clusters
-- (clusters), and the per-user save toggle (cluster_saves) that drives the
-- §9 90-day-author-purge exemption.
--
-- pgvector + pgcrypto were enabled in 0001; reused here for vector(1024)
-- embeddings (voyage-3-large dimensionality) and gen_random_uuid() defaults.
--
-- RLS is denied-by-default. Crawler tables (crawl_sources, crawl_runs) are
-- service-role-only — no policies. signals + clusters are read-only to
-- authenticated users (writes go through the service-role Inngest workers).
-- cluster_saves is self-only on all CRUD.

-- ---- crawl_sources ----
create table if not exists public.crawl_sources (
  id          text primary key
                check (id in ('reddit','hn','ph','app_store','play_store','trustpilot','g2','ih')),
  enabled     boolean not null default true,
  params      jsonb   not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

alter table public.crawl_sources enable row level security;
-- no policies → denied-by-default for non-service-role.

-- ---- crawl_runs ----
create table if not exists public.crawl_runs (
  id             uuid primary key default gen_random_uuid(),
  source         text not null references public.crawl_sources(id),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  cursor         text,
  items_fetched  integer not null default 0,
  items_kept     integer not null default 0,
  error          text
);

create index if not exists crawl_runs_source_started_idx
  on public.crawl_runs (source, started_at desc);

alter table public.crawl_runs enable row level security;
-- no policies → denied-by-default.

-- ---- clusters ----
-- Created BEFORE signals (signals.cluster_id references clusters.id).
create table if not exists public.clusters (
  id              uuid primary key default gen_random_uuid(),
  centroid        vector(1024) not null,
  member_count    integer not null default 1,
  title           text,
  summary         text,
  pain_score      numeric(4, 2),
  audience        text,
  keywords        text[],
  last_signal_at  timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index if not exists clusters_last_signal_idx
  on public.clusters (last_signal_at desc);
create index if not exists clusters_keywords_gin
  on public.clusters using gin (keywords);
create index if not exists clusters_centroid_hnsw
  on public.clusters using hnsw (centroid vector_cosine_ops)
  with (m = 16, ef_construction = 64);

alter table public.clusters enable row level security;

drop policy if exists "clusters authenticated read" on public.clusters;
create policy "clusters authenticated read"
  on public.clusters for select
  to authenticated
  using (true);

-- ---- signals ----
create table if not exists public.signals (
  id                   uuid primary key default gen_random_uuid(),
  source               text not null references public.crawl_sources(id),
  source_id            text not null,
  url                  text not null,
  title                text,
  body                 text not null,
  author               text,
  author_collected_at  timestamptz default now(),
  posted_at            timestamptz not null,
  score                integer,
  comments_count       integer,
  embedding            vector(1024),
  cluster_id           uuid references public.clusters(id) on delete set null,
  extracted            jsonb,
  created_at           timestamptz not null default now(),
  unique (source, source_id)
);

create index if not exists signals_cluster_posted_idx
  on public.signals (cluster_id, posted_at desc);
create index if not exists signals_posted_idx
  on public.signals (posted_at desc);
create index if not exists signals_embedding_hnsw
  on public.signals using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

alter table public.signals enable row level security;

drop policy if exists "signals authenticated read" on public.signals;
create policy "signals authenticated read"
  on public.signals for select
  to authenticated
  using (true);

-- ---- cluster_saves ----
create table if not exists public.cluster_saves (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  cluster_id  uuid not null references public.clusters(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, cluster_id)
);

-- Index drives the "any save exists for this cluster?" probe in the §9 purge cron.
create index if not exists cluster_saves_cluster_idx
  on public.cluster_saves (cluster_id);

alter table public.cluster_saves enable row level security;

drop policy if exists "cluster_saves self select" on public.cluster_saves;
create policy "cluster_saves self select"
  on public.cluster_saves for select
  using (user_id = (select auth.uid()));

drop policy if exists "cluster_saves self insert" on public.cluster_saves;
create policy "cluster_saves self insert"
  on public.cluster_saves for insert
  with check (user_id = (select auth.uid()));

drop policy if exists "cluster_saves self delete" on public.cluster_saves;
create policy "cluster_saves self delete"
  on public.cluster_saves for delete
  using (user_id = (select auth.uid()));

-- ============================================================================
-- Seeds — register all 7 sources. params per source documents the per-source
-- knobs the crawler reads. Sources requiring a curated target list
-- (app_store, play_store, trustpilot, g2) ship disabled until the operator
-- fills params; enabled flips them on in /app config later.
-- ============================================================================
insert into public.crawl_sources (id, enabled, params) values
  ('reddit',     true,
   '{"subreddits":["SaaS","Entrepreneur","sideproject","startups","webdev","SmallBusiness"]}'::jsonb),
  ('hn',         true,  '{}'::jsonb),
  ('ph',         true,  '{}'::jsonb),
  ('app_store',  false, '{"countries":["us"],"app_ids":[]}'::jsonb),
  ('play_store', false, '{"package_ids":[]}'::jsonb),
  ('trustpilot', false, '{"domains":[]}'::jsonb),
  ('g2',         false, '{"products":[]}'::jsonb),
  ('ih',         true,  '{}'::jsonb)
on conflict (id) do nothing;

-- ============================================================================
-- Phase 2 prompt bodies — UPDATE the rows seeded by 0002_llm_registry.sql.
-- These are the actual instructions the LLM router prepends as the system
-- message when called with promptName='extract.signals' /
-- 'cluster.summarize'. Idempotent: re-running just overwrites the body.
-- ============================================================================

update public.prompts
   set body = $body$You analyze a single user complaint and extract structured pain signals.
Input is a forum, app-store, or social post body. Output JSON exactly matching:
{ "pain": string,                    // one-sentence summary of the pain
  "audience": string,                // who suffers from it, 1-4 words
  "current_solution": string | null, // what they try today, or null
  "willingness_to_pay": "none"|"low"|"medium"|"high",
  "keywords": string[]               // 3-8 lowercase keywords, no #s, no hashtags
}
Be literal. Do not invent details not present in the input. If the post is not a complaint at all, set pain to a short paraphrase and willingness_to_pay to "none".$body$,
       active = true
 where name = 'extract.signals' and version = 'v1';

update public.prompts
   set body = $body$You see up to 10 related user complaints (signals) about the same underlying pain.
Synthesize them into a single product opportunity. Output JSON exactly matching:
{ "title": string,       // 6-10 words, framed as an OPPORTUNITY (e.g. "Faster Shopify analytics for small stores"), NOT "people complain about X"
  "summary": string,     // 2-3 sentences, concrete and non-generic
  "pain_score": number,  // 0-10 = severity * frequency * willingness, rounded to 1 decimal
  "audience": string,    // most common audience across signals
  "keywords": string[]   // 5-10 deduped lowercase keywords, no hashtags
}
Be specific. If signals contradict each other, pick the majority opinion and ignore the rest.$body$,
       active = true
 where name = 'cluster.summarize' and version = 'v1';
