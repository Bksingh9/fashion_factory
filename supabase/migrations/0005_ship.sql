-- 0005_ship.sql — Phase 4 schema. Locked specs are turned into fresh
-- GitHub repos via the PainPilot GitHub App; ship_runs tracks the
-- multi-step pipeline (scaffold → generate-plan → generate-files →
-- commit → enable-checks → optional-deploy). ship_files records
-- provenance (who generated each file: template / spec.generate /
-- ship.route.generate / ...).
--
-- ship_templates is the registry of reusable starter repos.

-- ---- ship_templates ----
create table if not exists public.ship_templates (
  id              text primary key,
  name            text not null,
  repo_url        text not null,
  default_branch  text not null default 'main',
  manifest        jsonb not null default '{}'::jsonb,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

alter table public.ship_templates enable row level security;

drop policy if exists "ship_templates authenticated read" on public.ship_templates;
create policy "ship_templates authenticated read"
  on public.ship_templates for select
  to authenticated
  using (true);

-- ---- ship_runs ----
create table if not exists public.ship_runs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  spec_id            uuid not null references public.specs(id) on delete cascade,
  template_id        text not null references public.ship_templates(id),
  status             text not null default 'queued'
                       check (status in ('queued','scaffolding','generating','pushing','deploying','done','failed')),
  repo_owner         text,
  repo_name          text,
  repo_url           text,
  installation_id    bigint,
  default_branch     text,
  vercel_project_id  text,
  deploy_url         text,
  error              text,
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  metrics            jsonb not null default '{}'::jsonb
);

create index if not exists ship_runs_user_started_idx
  on public.ship_runs (user_id, started_at desc);
create index if not exists ship_runs_status_idx
  on public.ship_runs (status);
create index if not exists ship_runs_spec_idx
  on public.ship_runs (spec_id);

alter table public.ship_runs enable row level security;

drop policy if exists "ship_runs self read" on public.ship_runs;
create policy "ship_runs self read"
  on public.ship_runs for select
  using (user_id = (select auth.uid()));

-- ---- ship_files ----
create table if not exists public.ship_files (
  id            bigserial primary key,
  run_id        uuid not null references public.ship_runs(id) on delete cascade,
  path          text not null,
  sha           text,
  bytes         integer,
  generated_by  text not null
                  check (generated_by in ('template','spec.generate','ship.route.generate','ship.component.generate','ship.readme.generate','ship.commit_message','ship.test.smoke'))
);

create index if not exists ship_files_run_idx on public.ship_files (run_id);

alter table public.ship_files enable row level security;

drop policy if exists "ship_files self read" on public.ship_files;
create policy "ship_files self read"
  on public.ship_files for select
  using (
    run_id in (select id from public.ship_runs where user_id = (select auth.uid()))
  );

-- ============================================================================
-- Phase 4 prompt bodies — 6 new INSERTs (all v1, active=true).
-- Bodies describe the JSON output shape the zod schemas in
-- /src/server/ship/plan.ts parse.
-- ============================================================================

insert into public.prompts (name, version, body, active) values
  ('ship.plan', 'v1',
   $body$You are given a locked product spec (audience, competitors, WTP+pricing, features, GTM).
Plan the file layout for a fresh Next.js MVP repo. Output JSON exactly matching:
{ "files": [{ "path": string, "kind": "route"|"component"|"lib"|"config"|"test", "summary": string, "deps": string[] }] }
Constraints:
- 8-25 files total.
- "route" paths under /src/app/, "component" paths under /src/components/, "lib" paths under /src/lib/.
- One file per concrete feature slug from spec.features.mvp.
- Include README, .env.example, and one smoke test.$body$,
   true)
on conflict (name, version) do nothing;

insert into public.prompts (name, version, body, active) values
  ('ship.route.generate', 'v1',
   $body$You are given the locked product spec + the planned file metadata for a single route.
Generate the file contents. Output JSON exactly matching:
{ "path": string, "contents": string }
Constraints:
- TypeScript strict; no `any`.
- Use Next.js 16 App Router conventions.
- Server-render where possible; "use client" only when interactivity demands.
- Imports must be valid; do not invent npm packages.$body$,
   true)
on conflict (name, version) do nothing;

insert into public.prompts (name, version, body, active) values
  ('ship.component.generate', 'v1',
   $body$You are given the locked product spec + the planned file metadata for a single component.
Generate the file contents. Output JSON exactly matching:
{ "path": string, "contents": string }
Constraints:
- TypeScript strict.
- Default to RSC; "use client" only when state/effects are needed.
- Style via Tailwind utility classes.$body$,
   true)
on conflict (name, version) do nothing;

insert into public.prompts (name, version, body, active) values
  ('ship.readme.generate', 'v1',
   $body$You are given the locked product spec + the planned file layout.
Generate the README.md. Output JSON exactly matching:
{ "contents": string }
Sections: What this is, Getting started, Architecture, Deploy. No marketing fluff.$body$,
   true)
on conflict (name, version) do nothing;

insert into public.prompts (name, version, body, active) values
  ('ship.commit_message', 'v1',
   $body$You are given the spec summary + the file list for the first commit.
Generate a conventional commit message. Output JSON exactly matching:
{ "title": string, "body": string }
Title format: "feat: <short, <60 chars>". Body: 2-4 bullet points naming the largest features.$body$,
   true)
on conflict (name, version) do nothing;

insert into public.prompts (name, version, body, active) values
  ('ship.test.smoke', 'v1',
   $body$You are given the spec summary + the file list.
Generate a single Playwright smoke test that loads "/" and asserts a heading from spec.features.mvp[0].title is visible. Output JSON exactly matching:
{ "path": string, "contents": string }
Path should be "tests/e2e/smoke.spec.ts".$body$,
   true)
on conflict (name, version) do nothing;

-- ============================================================================
-- Seed one default template — points at a PainPilot-owned starter repo.
-- Replace SHIP_TEMPLATE_REPO env to override per deployment.
-- ============================================================================
insert into public.ship_templates (id, name, repo_url, manifest, active) values
  ('nextjs-starter-stripe', 'Next.js starter (Stripe + Supabase)',
   'https://github.com/painpilot/nextjs-starter-stripe',
   '{"runtime":"node20","framework":"next@16","includes":["supabase-ssr","stripe","tailwind"]}'::jsonb,
   true)
on conflict (id) do nothing;
