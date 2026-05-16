#!/usr/bin/env tsx
/**
 * Phase 2 verification — "Listen + Cluster" exit criteria.
 *
 * Reports ok / fail / skip per check. Sandbox default: LLM_STUB=1,
 * RATELIMIT_STUB=1, STUB_CRAWLER=1 — all green achievable without
 * external credentials. Real-env-required checks (migration applied,
 * pgvector index existence, real Reddit OAuth probe) surface as `skip`
 * with a diagnostic in sandbox; flip the corresponding STUB knob off and
 * they run live.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Populate dummy env BEFORE importing anything that touches env.ts.
const DUMMY: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "https://stub.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "stub",
  SUPABASE_SERVICE_ROLE_KEY: "stub",
  ANTHROPIC_API_KEY: "stub",
  GROQ_API_KEY: "stub",
  PERPLEXITY_API_KEY: "stub",
  VOYAGE_API_KEY: "stub",
  COHERE_API_KEY: "stub",
  OPENROUTER_API_KEY: "stub",
  BRAVE_SEARCH_API_KEY: "stub",
  STRIPE_SECRET_KEY: "sk_test_stub",
  STRIPE_WEBHOOK_SECRET: "whsec_stub",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_stub",
  POLAR_ACCESS_TOKEN: "stub",
  POLAR_WEBHOOK_SECRET: "stub",
  UPSTASH_REDIS_REST_URL: "https://stub.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "stub",
  INNGEST_EVENT_KEY: "stub",
  INNGEST_SIGNING_KEY: "signkey-stub-12345",
  RESEND_API_KEY: "stub",
  FROM_EMAIL: "stub@example.com",
  LANGFUSE_PUBLIC_KEY: "stub",
  LANGFUSE_SECRET_KEY: "stub",
  LANGFUSE_HOST: "https://stub.langfuse.com",
  AXIOM_TOKEN: "stub",
  AXIOM_DATASET: "stub",
  SENTRY_DSN: "stub",
  NEXT_PUBLIC_SENTRY_DSN: "stub",
  NEXT_PUBLIC_POSTHOG_KEY: "stub",
  NEXT_PUBLIC_POSTHOG_HOST: "https://stub.i.posthog.com",
  REDDIT_CLIENT_ID: "stub",
  REDDIT_CLIENT_SECRET: "stub",
  PRODUCT_HUNT_API_TOKEN: "stub",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  REDDIT_USER_AGENT: "painpilot-verify/0.1",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY: "stub",
  GITHUB_APP_CLIENT_ID: "stub",
  GITHUB_APP_CLIENT_SECRET: "stub",
  GITHUB_APP_WEBHOOK_SECRET: "stub",
};
for (const [k, v] of Object.entries(DUMMY)) {
  if (process.env[k] === undefined) process.env[k] = v;
}
process.env.LLM_STUB = process.env.LLM_STUB ?? "1";
process.env.STRIPE_STUB = process.env.STRIPE_STUB ?? "1";
process.env.RATELIMIT_STUB = process.env.RATELIMIT_STUB ?? "1";
process.env.OBSERVABILITY_STUB = process.env.OBSERVABILITY_STUB ?? "1";
process.env.STUB_CRAWLER = process.env.STUB_CRAWLER ?? "1";

const ROOT = process.cwd();

type Status = "ok" | "fail" | "skip";
interface Result {
  name: string;
  status: Status;
  detail?: string;
}
const results: Result[] = [];
function record(name: string, status: Status, detail?: string): void {
  results.push({ name, status, ...(detail === undefined ? {} : { detail }) });
}
function ok(name: string): void {
  record(name, "ok");
}
function fail(name: string, detail: string): void {
  record(name, "fail", detail);
}
function skip(name: string, detail: string): void {
  record(name, "skip", detail);
}
function readIfExists(p: string): string | null {
  const abs = path.join(ROOT, p);
  return existsSync(abs) ? readFileSync(abs, "utf8") : null;
}

const CRAWL_SOURCES = [
  "reddit",
  "hn",
  "ph",
  "app_store",
  "play_store",
  "trustpilot",
  "g2",
  "ih",
] as const;

async function main(): Promise<void> {
  // ==========================================================================
  // 1. Migration 0003 exists and declares the 5 new tables.
  // ==========================================================================
  {
    const sql = readIfExists("supabase/migrations/0003_signals.sql");
    if (sql === null) {
      fail("migration 0003_signals.sql exists", "missing");
    } else {
      const tables = ["crawl_sources", "crawl_runs", "clusters", "signals", "cluster_saves"];
      const missing = tables.filter(
        (t) => !new RegExp(`create table[^;]*\\b${t}\\b`, "i").test(sql),
      );
      if (missing.length > 0) {
        fail("migration 0003 declares all 5 new tables", `missing: ${missing.join(", ")}`);
      } else {
        ok("migration 0003 declares all 5 new tables (crawl_sources, crawl_runs, clusters, signals, cluster_saves)");
      }
    }
  }

  // ==========================================================================
  // 2. RLS enabled on each new table.
  // ==========================================================================
  {
    const sql = readIfExists("supabase/migrations/0003_signals.sql") ?? "";
    const tables = ["crawl_sources", "crawl_runs", "clusters", "signals", "cluster_saves"];
    const noRls = tables.filter(
      (t) =>
        !new RegExp(
          `alter table[^;]*\\b${t}\\b[^;]*enable row level security`,
          "i",
        ).test(sql),
    );
    if (noRls.length > 0) fail("RLS enabled on all 5 new tables", `missing: ${noRls.join(", ")}`);
    else ok("RLS enabled on all 5 new tables");
  }

  // ==========================================================================
  // 3. pgvector HNSW index declared on signals.embedding.
  // ==========================================================================
  {
    const sql = readIfExists("supabase/migrations/0003_signals.sql") ?? "";
    if (/signals_embedding_hnsw[\s\S]*hnsw\s*\(\s*embedding\s+vector_cosine_ops/i.test(sql)) {
      ok("signals_embedding_hnsw declared (HNSW + cosine ops)");
    } else {
      fail("HNSW index on signals.embedding", "signals_embedding_hnsw not found");
    }
  }

  // ==========================================================================
  // 4. types/database.ts exports the 5 new tables.
  // ==========================================================================
  {
    const ts = readIfExists("src/types/database.ts") ?? "";
    const missing = ["crawl_sources", "crawl_runs", "clusters", "signals", "cluster_saves"].filter(
      (t) => !new RegExp(`\\b${t}\\s*:\\s*\\{[\\s\\S]*?Row\\s*:`, "i").test(ts),
    );
    if (missing.length > 0) {
      fail("database.ts has all 5 new Tables", `missing: ${missing.join(", ")}`);
    } else {
      ok("database.ts: 5 new Tables (Row/Insert/Update) present");
    }
  }

  // ==========================================================================
  // 5. env.ts requires the 3 new env vars.
  // ==========================================================================
  {
    const env = readIfExists("src/env.ts") ?? "";
    const missing = ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "PRODUCT_HUNT_API_TOKEN"].filter(
      (v) => !new RegExp(`\\b${v}\\b\\s*:\\s*z\\.string`, "i").test(env),
    );
    if (missing.length > 0) {
      fail("env.ts requires Phase 2 vars", `missing: ${missing.join(", ")}`);
    } else {
      ok("env.ts requires REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, PRODUCT_HUNT_API_TOKEN");
    }
  }

  // ==========================================================================
  // 6. All 7 crawler files + types module + Reddit OAuth helper exist.
  // ==========================================================================
  {
    const required: { name: string; file: string }[] = [
      { name: "sources/types.ts", file: "src/server/sources/types.ts" },
      ...CRAWL_SOURCES.map((s) => ({ name: `sources/${s}.ts`, file: `src/server/sources/${s}.ts` })),
      { name: "auth/reddit_oauth.ts", file: "src/server/auth/reddit_oauth.ts" },
      { name: "sources/schemas.ts", file: "src/server/sources/schemas.ts" },
    ];
    const missing = required.filter((r) => !existsSync(path.join(ROOT, r.file)));
    if (missing.length > 0) {
      fail("all crawler + OAuth files exist", missing.map((m) => m.name).join(", "));
    } else {
      ok("all 7 crawler files + types.ts + schemas.ts + reddit_oauth.ts present");
    }
  }

  // ==========================================================================
  // 7. CI guard rule (a) refined to allow OAuth /access_token endpoints.
  // ==========================================================================
  {
    const guard = readIfExists("tests/unit/no_auto_post.test.ts") ?? "";
    if (/access_token|\/oauth|\/o\/token/.test(guard)) {
      ok("no_auto_post rule (a) refined: allows /access_token + /oauth/ paths");
    } else {
      fail(
        "no_auto_post rule (a) refinement",
        "guard does not whitelist OAuth token endpoints — Reddit OAuth POST will trip rule (a)",
      );
    }
  }

  // ==========================================================================
  // 8. Inngest barrel registers the 6 Phase 2 functions.
  // ==========================================================================
  {
    const barrel = readIfExists("src/server/inngest/functions/index.ts") ?? "";
    const needed = [
      "crawl.scheduler",
      "crawl.run",
      "signal.embed",
      "signal.cluster",
      "cluster.summarize",
      "privacy.purge_authors",
    ];
    const missing = needed.filter((n) => !barrel.includes(n.replace(/\./g, "")) && !barrel.includes(n));
    // Loose match: either dotted ("crawl.run") or camel ("crawlRun") variants count.
    if (missing.length === 0) {
      ok("inngest barrel registers all 6 Phase 2 functions");
    } else if (missing.length === needed.length) {
      fail("inngest Phase 2 functions registered", "none of the 6 found in barrel");
    } else {
      fail("inngest Phase 2 functions registered", `missing: ${missing.join(", ")}`);
    }
  }

  // ==========================================================================
  // 9. Prompts: extract.signals + cluster.summarize have non-placeholder bodies.
  // ==========================================================================
  {
    const sql = readIfExists("supabase/migrations/0003_signals.sql") ?? "";
    // Match either an UPDATE prompts SET body = '…' for extract.signals or
    // an INSERT … ON CONFLICT … DO UPDATE that lifts body past the 100-char floor.
    const hasExtract =
      /update\s+public\.prompts[\s\S]*extract\.signals[\s\S]*body\s*=/i.test(sql) ||
      /'extract\.signals'[\s\S]{0,800}'[^']{100,}'/i.test(sql);
    const hasCluster =
      /update\s+public\.prompts[\s\S]*cluster\.summarize[\s\S]*body\s*=/i.test(sql) ||
      /'cluster\.summarize'[\s\S]{0,800}'[^']{100,}'/i.test(sql);
    if (hasExtract && hasCluster) {
      ok("prompts extract.signals + cluster.summarize bodies upgraded in 0003");
    } else {
      fail(
        "Phase 2 prompt bodies populated",
        `extract.signals=${String(hasExtract)} cluster.summarize=${String(hasCluster)}`,
      );
    }
  }

  // ==========================================================================
  // 10-14. Behavioural — exercised via dynamic imports once chunks 2-6 land.
  // For chunk 1, all of these are expected red. Each check tolerates missing
  // module gracefully (skip with diagnostic) so the report stays meaningful.
  // ==========================================================================
  async function tryImport<T>(rel: string): Promise<T | null> {
    const abs = path.join(ROOT, rel);
    if (!existsSync(abs)) return null;
    try {
      return (await import(abs)) as T;
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  // 10. Crawler dedup — same source_id twice → only one insert.
  {
    const persist = await tryImport<{ persistSignals?: (rows: unknown[]) => Promise<{ inserted: number }> }>(
      "src/server/inngest/functions/crawl.run.ts",
    );
    if (persist === null || typeof persist.persistSignals !== "function") {
      skip("crawler dedup unit", "crawl.run not implemented yet (chunk 4)");
    } else {
      // Implemented in chunk 4 — feed two rows with identical (source, source_id),
      // expect inserted = 1.
      skip("crawler dedup unit", "wired but not yet asserted by this check");
    }
  }

  // 11. Embedding pipeline (signal.embed) produces a 1024-dim vector.
  {
    const mod = await tryImport<{ embedSignalForTest?: (body: string) => Promise<{ embedding: number[] }> }>(
      "src/server/inngest/functions/signal.embed.ts",
    );
    if (mod === null || typeof mod.embedSignalForTest !== "function") {
      skip("signal.embed pipeline", "signal.embed not implemented yet (chunk 4)");
    } else {
      const { embedding } = await mod.embedSignalForTest("verify body");
      if (embedding.length === 1024 || embedding.length === 8) {
        // Stub embed returns 8-dim; production voyage returns 1024.
        ok("signal.embed produces a deterministic vector (stub: 8d, real: 1024d)");
      } else {
        fail("signal.embed dimensionality", `got ${String(embedding.length)} dims`);
      }
    }
  }

  // 12. Cluster assignment: near-identical → same cluster; orthogonal → new cluster.
  {
    const mod = await tryImport<{
      assignClusterForTest?: (centroidJson: string, neighbors: { id: string; centroid: string }[], threshold: number) => Promise<{ matchedId: string | null }>;
    }>("src/server/inngest/functions/signal.cluster.ts");
    if (mod === null || typeof mod.assignClusterForTest !== "function") {
      skip("cluster assignment unit", "signal.cluster not implemented yet (chunk 4)");
    } else {
      skip("cluster assignment unit", "implementation hook present; coverage in tests/unit/cluster.assign.test.ts");
    }
  }

  // 13. Author purge respects cluster_saves.
  {
    const mod = await tryImport<{ buildPurgeSql?: () => string }>(
      "src/server/inngest/functions/privacy.purge_authors.ts",
    );
    if (mod === null || typeof mod.buildPurgeSql !== "function") {
      skip("privacy.purge_authors SQL", "function not implemented yet (chunk 6)");
    } else {
      const sql = mod.buildPurgeSql();
      const matchesIntent =
        /update\s+signals/i.test(sql) &&
        /author\s*=\s*null/i.test(sql) &&
        /cluster_saves/i.test(sql) &&
        /90 days/i.test(sql);
      if (matchesIntent) {
        ok("purge SQL: nulls author after 90d unless cluster has a cluster_saves row");
      } else {
        fail("purge SQL intent", "expected to UPDATE signals SET author=null with 90d + cluster_saves guard");
      }
    }
  }

  // 14. App feed page replaced with the signal feed.
  {
    const page = readIfExists("src/app/app/page.tsx") ?? "";
    if (/cluster|signal-feed|signalFeed/i.test(page) && !/Phase 1 spine is live/i.test(page)) {
      ok("/app feed UI replaced with cluster-based signal feed");
    } else {
      fail("/app feed UI", "still rendering the Phase 1 Welcome placeholder");
    }
  }

  // ==========================================================================
  // 15. Real-env-required checks — surfaced as `skip` in sandbox.
  // ==========================================================================
  if (process.env.STUB_CRAWLER === "1") {
    skip(
      "real Reddit OAuth token fetch (200)",
      "STUB_CRAWLER=1; unset to probe https://www.reddit.com/api/v1/access_token",
    );
    skip("migration applied to live DB", "no Supabase reachability in sandbox");
    skip("pgvector HNSW index present in live DB", "no Supabase reachability in sandbox");
    skip("crawl lag (p95 < 30min)", "production-observation metric; not measurable in sandbox");
  }

  // ==========================================================================
  // 16. Regression — Phase 0 + Phase 1 verify scripts still present.
  // ==========================================================================
  {
    if (!existsSync(path.join(ROOT, "scripts/verify-phase-0.ts"))) {
      fail("regression: verify-phase-0.ts still present", "missing");
    } else if (!existsSync(path.join(ROOT, "scripts/verify-phase-1.ts"))) {
      fail("regression: verify-phase-1.ts still present", "missing");
    } else {
      ok("regression: verify-phase-0 + verify-phase-1 scripts intact");
    }
  }

  // ==========================================================================
  // Report
  // ==========================================================================
  let okCount = 0;
  let failCount = 0;
  let skipCount = 0;
  const lines: string[] = [];
  for (const r of results) {
    const mark = r.status === "ok" ? "✓" : r.status === "fail" ? "✗" : "•";
    const tail = r.detail !== undefined ? `  — ${r.detail}` : "";
    lines.push(`${mark} ${r.name}${tail}`);
    if (r.status === "ok") okCount++;
    else if (r.status === "fail") failCount++;
    else skipCount++;
  }
  console.log(lines.join("\n"));
  console.log("");
  console.log(
    `${String(okCount)} ok, ${String(failCount)} fail, ${String(skipCount)} skip (${String(results.length)} total)`,
  );
  process.exit(failCount === 0 ? 0 : 1);
}

void main().catch((e: unknown) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
