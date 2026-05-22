-- 0009_more_sources.sql — Phase 8 (post-launch): add 2 free no-auth
-- crawlers + make Reddit OAuth optional. Removes signup friction from
-- the "Listen" surface.

-- ---- Extend CrawlSource check constraint ----
alter table public.crawl_sources
  drop constraint if exists crawl_sources_id_check;
alter table public.crawl_sources
  add constraint crawl_sources_id_check
  check (id in (
    'reddit', 'hn', 'ph', 'app_store', 'play_store',
    'trustpilot', 'g2', 'ih',
    'github_issues', 'devto'
  ));

-- ---- Seed the 2 new sources ----
insert into public.crawl_sources (id, enabled, params) values
  ('github_issues', true,
   '{"queries":["is:issue label:bug is:open","is:issue label:enhancement is:open","\"I wish there was\" in:title,body"],"per_page":25}'::jsonb),
  ('devto', true,
   '{"per_page":30,"tags":["webdev","saas","indie","startup"]}'::jsonb)
on conflict (id) do nothing;
