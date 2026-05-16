-- 0008_marketplace.sql — Phase 7 schema. Public marketplace listings,
-- affiliate links + click tracking, and UPDATEs to the launch.* prompts.

-- ---- marketplace_listings ----
create table if not exists public.marketplace_listings (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid unique not null references public.products(id) on delete cascade,
  slug              text unique not null,
  headline          text not null,
  body_md           text not null,
  hero_image_path   text,
  founder_handle    text,
  featured          boolean not null default false,
  published_at      timestamptz,
  sort_score        numeric(10, 4) not null default 0,
  created_at        timestamptz not null default now()
);
create index if not exists marketplace_listings_featured_idx
  on public.marketplace_listings (featured, sort_score desc);
create index if not exists marketplace_listings_published_idx
  on public.marketplace_listings (published_at desc);

alter table public.marketplace_listings enable row level security;

-- Anonymous read for published rows only.
drop policy if exists "marketplace anon read published" on public.marketplace_listings;
create policy "marketplace anon read published"
  on public.marketplace_listings for select
  using (published_at is not null);

-- ---- affiliates ----
create table if not exists public.affiliates (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  target_url        text not null,
  partner           text,
  rev_share_bps     integer not null default 0,
  active            boolean not null default true,
  rotation_weight   integer not null default 100,
  created_at        timestamptz not null default now()
);
create index if not exists affiliates_active_weight_idx
  on public.affiliates (active, rotation_weight desc);

alter table public.affiliates enable row level security;
-- No public read; the redirect route reads via service role.

-- ---- affiliate_clicks ----
create table if not exists public.affiliate_clicks (
  id            bigserial primary key,
  affiliate_id  uuid not null references public.affiliates(id) on delete cascade,
  ip_hash       text,
  ua_hash       text,
  referrer      text,
  created_at    timestamptz not null default now()
);
create index if not exists affiliate_clicks_affiliate_idx
  on public.affiliate_clicks (affiliate_id, created_at desc);

alter table public.affiliate_clicks enable row level security;
-- No public read; service-role inserts from the redirect route.

-- ============================================================================
-- UPDATE the launch.* prompt bodies (all seeded as TBD by 0002).
-- ============================================================================

update public.prompts set body = $body$You are given a locked product spec. Produce the marketing landing page copy.
Output JSON exactly matching:
{ "hero": { "headline": string, "sub": string, "cta": string },
  "sections": [{ "title": string, "body": string }],
  "faq": [{ "q": string, "a": string }]
}
Be concrete and specific. Use the spec's audience + WTP + features verbatim where possible.$body$, active = true
 where name = 'launch.landing_page' and version = 'v1';

update public.prompts set body = $body$You are given a locked product spec. Draft the Product Hunt launch assets.
Output JSON exactly matching:
{ "tagline": string,
  "description": string,
  "first_comment": string,
  "gallery_alt": string[]
}
Tagline ≤ 60 chars. Description ≤ 260 chars. first_comment is the maker's launch-day "I built this because..." post.$body$, active = true
 where name = 'launch.product_hunt' and version = 'v1';

update public.prompts set body = $body$DRAFT-ONLY (never auto-post). You are given a locked product spec. Draft an X thread.
Output JSON exactly matching:
{ "tweets": [{ "text": string, "media_alt": string | null }] }
6-10 tweets. Each ≤ 280 chars. First tweet hooks; last tweet CTAs to the launch URL.$body$, active = true
 where name = 'launch.x_thread' and version = 'v1';

update public.prompts set body = $body$You are given a locked product spec + a target ICP description. Draft a cold email.
Output JSON exactly matching:
{ "subject": string, "preheader": string, "body": string }
Subject ≤ 60 chars. Preheader ≤ 90 chars. Body 80-150 words, plain text, single CTA.$body$, active = true
 where name = 'launch.cold_email' and version = 'v1';

update public.prompts set body = $body$DRAFT-ONLY (never auto-post; §9 invariant). You are given a locked spec.
Draft polite, value-add reply templates for a curated subreddit list. Output JSON:
{ "replies": [{ "subreddit": string, "draft_text": string }] }
Every draft_text MUST mention "draft" and never include a direct product link.$body$, active = true
 where name = 'launch.reddit_replies' and version = 'v1';
