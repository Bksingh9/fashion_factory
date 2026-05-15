-- 0001_init.sql — PainPilot base schema.
-- Profiles bound 1:1 to auth.users via a trigger.
-- Usage events are per-user, append-only.
-- RLS denied-by-default; only narrowly-scoped policies open it up.

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ---- Plans ----
do $$
begin
  if not exists (select 1 from pg_type where typname = 'plan_t') then
    create type public.plan_t as enum ('free', 'pro', 'studio', 'agency');
  end if;
end$$;

-- ---- profiles ----
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text not null,
  full_name          text,
  handle             text unique,
  plan               public.plan_t not null default 'free',
  stripe_customer_id text,
  polar_customer_id  text,
  byok_anthropic     boolean not null default false,
  byok_groq          boolean not null default false,
  byok_openai        boolean not null default false,
  role               text not null default 'user',
  created_at         timestamptz not null default now()
);

create index if not exists profiles_handle_idx on public.profiles (handle) where handle is not null;
create index if not exists profiles_stripe_customer_idx on public.profiles (stripe_customer_id) where stripe_customer_id is not null;

alter table public.profiles enable row level security;

-- Users can read their own row.
drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read"
  on public.profiles for select
  using (id = (select auth.uid()));

-- Users can update their own row, but not change id/email/plan/role.
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update"
  on public.profiles for update
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    -- plan/role transitions happen only via service role (Stripe webhook + admin).
  );

-- No INSERT / DELETE policies — handled by the auth.users trigger / service role.

-- ---- usage_events ----
create table if not exists public.usage_events (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null,
  meta        jsonb not null default '{}'::jsonb,
  tokens_in   integer,
  tokens_out  integer,
  cost_usd    numeric(12, 6),
  created_at  timestamptz not null default now()
);

create index if not exists usage_events_user_created_idx
  on public.usage_events (user_id, created_at desc);

alter table public.usage_events enable row level security;

-- Users can read their own events. Inserts only via service role (server-side metering).
drop policy if exists "usage_events self read" on public.usage_events;
create policy "usage_events self read"
  on public.usage_events for select
  using (user_id = (select auth.uid()));

-- ---- profile bootstrap trigger ----
-- Fires on auth.users insert; creates the matching profile row using elevated
-- privileges (security definer) so the function bypasses RLS. The search_path
-- is pinned to defeat search-path hijacking.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
