-- 0007_ops.sql — Phase 6 schema. eval_runs records promptfoo regression
-- runs; perf_budget_violations records §6 perf-budget breaches detected
-- by the perf.budget.scan cron.

-- ---- eval_runs ----
create table if not exists public.eval_runs (
  id              uuid primary key default gen_random_uuid(),
  prompt_name     text not null,
  prompt_version  text not null,
  suite           text not null,
  passed          integer not null default 0,
  failed          integer not null default 0,
  total           integer not null default 0,
  score           numeric(5, 4),
  report          jsonb,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);
create index if not exists eval_runs_prompt_idx
  on public.eval_runs (prompt_name, started_at desc);

alter table public.eval_runs enable row level security;

drop policy if exists "eval_runs authenticated read" on public.eval_runs;
create policy "eval_runs authenticated read"
  on public.eval_runs for select
  to authenticated
  using (true);

-- ---- perf_budget_violations ----
create table if not exists public.perf_budget_violations (
  id          bigserial primary key,
  route       text not null,
  metric      text not null,
  threshold   numeric not null,
  observed    numeric not null,
  window      text not null,
  created_at  timestamptz not null default now()
);
create index if not exists perf_budget_violations_route_idx
  on public.perf_budget_violations (route, created_at desc);

alter table public.perf_budget_violations enable row level security;

-- Admin-only: profiles.role = 'admin'. No anon/authenticated read.
drop policy if exists "perf_violations admin read" on public.perf_budget_violations;
create policy "perf_violations admin read"
  on public.perf_budget_violations for select
  using (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  );
