-- 0004_validate.sql — Phase 3 schema. Saved clusters become locked product
-- specs with structured sections: audience, competitors, WTP+pricing,
-- features, GTM. A spec_events log captures every section generation +
-- edit + lock transition so the streaming pipeline (signal.cluster-style
-- Inngest function in chunk 4) can resume / audit partial runs.
--
-- pgcrypto + pgvector were enabled in 0001; reused here for
-- gen_random_uuid() defaults.

-- ---- specs ----
create table if not exists public.specs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  cluster_id  uuid not null references public.clusters(id) on delete cascade,
  version     integer not null default 1,
  status      text not null default 'draft'
                check (status in ('draft', 'locked')),
  audience    jsonb,
  competitors jsonb,
  wtp         jsonb,
  pricing     jsonb,
  features    jsonb,
  gtm         jsonb,
  locked_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (cluster_id, user_id, version)
);

create index if not exists specs_user_updated_idx
  on public.specs (user_id, updated_at desc);
create index if not exists specs_cluster_idx
  on public.specs (cluster_id);

alter table public.specs enable row level security;

drop policy if exists "specs self select" on public.specs;
create policy "specs self select"
  on public.specs for select
  using (user_id = (select auth.uid()));

drop policy if exists "specs self insert" on public.specs;
create policy "specs self insert"
  on public.specs for insert
  with check (user_id = (select auth.uid()));

drop policy if exists "specs self update" on public.specs;
create policy "specs self update"
  on public.specs for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "specs self delete" on public.specs;
create policy "specs self delete"
  on public.specs for delete
  using (user_id = (select auth.uid()));

-- Bump `updated_at` on every UPDATE — drives optimistic concurrency
-- (clients re-read after edits to avoid clobbering Inngest writes).
create or replace function public.touch_specs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists specs_touch_updated_at on public.specs;
create trigger specs_touch_updated_at
  before update on public.specs
  for each row execute function public.touch_specs_updated_at();

-- ---- spec_events ----
create table if not exists public.spec_events (
  id         bigserial primary key,
  spec_id    uuid not null references public.specs(id) on delete cascade,
  kind       text not null
               check (kind in ('section_generated', 'edited', 'locked', 'unlocked')),
  section    text,
  payload    jsonb,
  created_at timestamptz not null default now()
);

create index if not exists spec_events_spec_created_idx
  on public.spec_events (spec_id, created_at desc);

alter table public.spec_events enable row level security;

drop policy if exists "spec_events self read" on public.spec_events;
create policy "spec_events self read"
  on public.spec_events for select
  using (
    spec_id in (
      select id from public.specs where user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- Phase 3 prompt bodies — three updates + three inserts. Idempotent.
-- All v1, active=true. Bodies describe the JSON shape the LLM should emit;
-- zod schemas in /src/server/validate/schemas.ts (chunk 3) parse them.
-- ============================================================================

-- UPDATE validate.audience (seeded TBD in 0002)
update public.prompts
   set body = $body$You are given a clustered set of public complaints describing a single pain.
Identify the target audience for a product solving this pain. Output JSON exactly matching:
{ "primary": {
    "role": string,                     // job title, e.g. "Indie SaaS founder"
    "size": string,                     // approximate population, e.g. "~50k"
    "channels": string[],               // where they hang out (subreddits, slack groups, etc.)
    "jobs_to_be_done": string[]         // 3-6 specific JTBDs they care about
  },
  "secondary": { "role": string, "size": string }[],   // 0-3 adjacent audiences
  "anti_personas": string[],            // 0-3 people this is NOT for
  "confidence": number                  // 0-1, your belief in the primary persona
}
Be concrete. Avoid generic phrases like "modern professionals".$body$,
       active = true
 where name = 'validate.audience' and version = 'v1';

-- UPDATE validate.competitors (seeded TBD in 0002)
update public.prompts
   set body = $body$You are given a clustered pain + a list of recent web research snippets.
Identify direct and adjacent competitors. Output JSON exactly matching:
{ "direct": [{ "name": string, "url": string, "positioning": string, "pricing": string, "gap": string }],
  "adjacent": [{ "name": string, "url": string, "positioning": string }],
  "moats": string[],                    // what defensible advantages exist in this market
  "summary": string                     // 1-2 sentence competitive landscape summary
}
Cite real companies and URLs from the research snippets only. Do not invent.$body$,
       active = true
 where name = 'validate.competitors' and version = 'v1';

-- UPDATE spec.generate (seeded TBD in 0002)
update public.prompts
   set body = $body$You are given all sections of a locked product spec (audience, competitors, WTP+pricing,
features, GTM). Stitch them into a single canonical markdown document for the founder.
Output JSON exactly matching:
{ "title": string,                      // 6-10 words product name + tagline
  "markdown": string                    // full spec doc, ~600-1200 words, sectioned with h2 headers
}
Be terse and specific. No filler.$body$,
       active = true
 where name = 'spec.generate' and version = 'v1';

-- INSERT validate.wtp_pricing (new in 0004)
insert into public.prompts (name, version, body, active) values
  ('validate.wtp_pricing', 'v1',
   $body$You are given a clustered pain + audience profile + competitor pricing.
Recommend a willingness-to-pay band + a 3-tier pricing structure. Output JSON exactly matching:
{ "wtp_band": "<$10" | "$10-50" | "$50-200" | "$200-1k" | "$1k+",
  "confidence": number,                 // 0-1
  "rationale": string,                  // 2-3 sentences explaining the band
  "plans": [{ "name": string, "price_usd": number, "limits": string, "target": string }]
}
Plans should map to free/pro/scale or similar; price_usd is monthly.$body$,
   true)
on conflict (name, version) do nothing;

-- INSERT validate.features (new in 0004)
insert into public.prompts (name, version, body, active) values
  ('validate.features', 'v1',
   $body$You are given a clustered pain + audience profile + competitor gaps.
Propose the MVP feature list + a "v2" wishlist. Output JSON exactly matching:
{ "mvp": [{ "slug": string, "title": string, "desc": string, "priority": "must" | "should" | "could" }],
  "v2": [{ "slug": string, "title": string, "desc": string }]
}
MVP has 5-10 features. Use slugs (kebab-case) suitable for code-gen route paths in Phase 4.$body$,
   true)
on conflict (name, version) do nothing;

-- INSERT validate.gtm (new in 0004)
insert into public.prompts (name, version, body, active) values
  ('validate.gtm', 'v1',
   $body$You are given a clustered pain + audience profile + competitor positioning.
Propose the go-to-market plan. Output JSON exactly matching:
{ "channels": [{ "name": string, "hypothesis": string, "first_move": string }],
  "positioning": string,                // 1-2 sentence brand positioning vs alternatives
  "first_100_users_plan": string,       // concrete plan to get first 100 users
  "risks": string[]                     // 2-5 GTM risks + mitigations baked into wording
}
Channels should be the audience's actual hangouts from the audience.channels field.$body$,
   true)
on conflict (name, version) do nothing;
