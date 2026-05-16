-- 0006_operate.sql — Phase 5 schema. Once a founder ships an MVP, this
-- phase wires Polar marketplace billing + revenue share, hourly metric
-- snapshots, and monthly payout computations. products is 1:1 with
-- ship_runs (auto-created on ship.completed via Phase 5 chunk 4).

-- ---- products ----
create table if not exists public.products (
  id                  uuid primary key default gen_random_uuid(),
  ship_run_id         uuid unique not null references public.ship_runs(id) on delete cascade,
  user_id             uuid not null references public.profiles(id) on delete cascade,
  polar_product_id    text,
  slug                text unique not null,
  name                text not null,
  status              text not null default 'private' check (status in ('private','public')),
  revenue_share_bps   integer not null default 1000, -- 10% to PainPilot by default
  created_at          timestamptz not null default now()
);
create index if not exists products_user_idx on public.products (user_id);
create index if not exists products_status_idx on public.products (status);

alter table public.products enable row level security;

drop policy if exists "products self read" on public.products;
create policy "products self read"
  on public.products for select
  using (user_id = (select auth.uid()));

-- Public listings read happens via marketplace_listings in Phase 7.

-- ---- product_metrics ----
create table if not exists public.product_metrics (
  id                   bigserial primary key,
  product_id           uuid not null references public.products(id) on delete cascade,
  snapshot_at          timestamptz not null default now(),
  mrr_usd              numeric(14, 2),
  arr_usd              numeric(14, 2),
  users_count          integer,
  active_users_count   integer,
  churn_30d            numeric(5, 4),
  source               text not null check (source in ('polar','self_report','stripe_proxy'))
);
create index if not exists product_metrics_product_idx
  on public.product_metrics (product_id, snapshot_at desc);

alter table public.product_metrics enable row level security;

drop policy if exists "product_metrics self read" on public.product_metrics;
create policy "product_metrics self read"
  on public.product_metrics for select
  using (
    product_id in (select id from public.products where user_id = (select auth.uid()))
  );

-- ---- product_events ----
create table if not exists public.product_events (
  id              bigserial primary key,
  product_id      uuid not null references public.products(id) on delete cascade,
  kind            text not null,
  payload         jsonb not null,
  polar_event_id  text unique, -- idempotency key
  received_at     timestamptz not null default now()
);
create index if not exists product_events_product_idx
  on public.product_events (product_id, received_at desc);

alter table public.product_events enable row level security;

drop policy if exists "product_events self read" on public.product_events;
create policy "product_events self read"
  on public.product_events for select
  using (
    product_id in (select id from public.products where user_id = (select auth.uid()))
  );

-- ---- payouts ----
create table if not exists public.payouts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  period_start     date not null,
  period_end       date not null,
  gross_usd        numeric(14, 2) not null default 0,
  fee_usd          numeric(14, 2) not null default 0,
  net_usd          numeric(14, 2) not null default 0,
  status           text not null default 'pending' check (status in ('pending','sent','failed')),
  polar_payout_id  text,
  created_at       timestamptz not null default now(),
  unique (user_id, period_start, period_end)
);
create index if not exists payouts_user_period_idx on public.payouts (user_id, period_start desc);

alter table public.payouts enable row level security;

drop policy if exists "payouts self read" on public.payouts;
create policy "payouts self read"
  on public.payouts for select
  using (user_id = (select auth.uid()));

-- ============================================================================
-- Phase 5 prompts — 1 new INSERT.
-- ============================================================================

insert into public.prompts (name, version, body, active) values
  ('operate.weekly_digest', 'v1',
   $body$You are given a founder's product + last 7 days of product_metrics + product_events.
Write a weekly summary email body. Output JSON exactly matching:
{ "summary": string,         // 2-3 sentence executive summary
  "highlights": string[],    // 3-5 bullet highlights with concrete numbers
  "suggestions": string[]    // 1-3 actionable next steps grounded in the data
}
Use plain language. Refer to dollar amounts, user counts, and churn percentages from the data.$body$,
   true)
on conflict (name, version) do nothing;
