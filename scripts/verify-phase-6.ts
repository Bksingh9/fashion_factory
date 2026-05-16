#!/usr/bin/env tsx
/**
 * Phase 6 verification — Ops pass.
 *
 * Closes the Phase 1 observability stub debt structurally (preserves
 * interfaces; real DSN wiring is gated by OBSERVABILITY_STUB=1 vs the
 * real SDK init path). Adds promptfoo + perf-budget infrastructure.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

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
for (const k of ["LLM_STUB","STRIPE_STUB","RATELIMIT_STUB","OBSERVABILITY_STUB","STUB_CRAWLER","VALIDATE_STREAM_STUB","GITHUB_STUB","POLAR_STUB"]) {
  process.env[k] = process.env[k] ?? "1";
}

const ROOT = process.cwd();
type Status = "ok" | "fail" | "skip";
const results: { name: string; status: Status; detail?: string }[] = [];
function ok(name: string): void { results.push({ name, status: "ok" }); }
function fail(name: string, detail: string): void { results.push({ name, status: "fail", detail }); }
function skip(name: string, detail: string): void { results.push({ name, status: "skip", detail }); }
function readIfExists(p: string): string | null {
  const abs = path.join(ROOT, p);
  return existsSync(abs) ? readFileSync(abs, "utf8") : null;
}

async function main(): Promise<void> {
  // 1. Migration 0007 + tables
  {
    const sql = readIfExists("supabase/migrations/0007_ops.sql");
    if (sql === null) fail("migration 0007_ops.sql exists", "missing");
    else {
      const missing = ["eval_runs", "perf_budget_violations"].filter(
        (t) => !new RegExp(`create table[^;]*\\b${t}\\b`, "i").test(sql),
      );
      if (missing.length > 0) fail("0007 declares ops tables", missing.join(", "));
      else ok("migration 0007 declares eval_runs + perf_budget_violations");
    }
  }

  // 2. RLS + admin gate on perf_budget_violations
  {
    const sql = readIfExists("supabase/migrations/0007_ops.sql") ?? "";
    const violationsRls = /alter table[^;]*perf_budget_violations[^;]*enable row level security/i.test(sql);
    const evalRunsRls = /alter table[^;]*eval_runs[^;]*enable row level security/i.test(sql);
    const adminGate = /profiles[\s\S]*role\s*=\s*'admin'/i.test(sql);
    if (!violationsRls || !evalRunsRls) {
      fail("RLS enabled on ops tables", `violations=${String(violationsRls)} eval_runs=${String(evalRunsRls)}`);
    } else if (!adminGate) {
      fail("perf_budget_violations admin-only", "no profiles.role='admin' check");
    } else {
      ok("RLS on ops tables; perf_budget_violations admin-only");
    }
  }

  // 3. types
  {
    const ts = readIfExists("src/types/database.ts") ?? "";
    const missing = ["eval_runs", "perf_budget_violations"].filter(
      (t) => !new RegExp(`\\b${t}\\s*:\\s*\\{[\\s\\S]*?Row\\s*:`, "i").test(ts),
    );
    if (missing.length > 0) fail("database.ts ops tables", missing.join(", "));
    else ok("database.ts: eval_runs + perf_budget_violations typed");
  }

  // 4. env Phase 6 vars
  {
    const env = readIfExists("src/env.ts") ?? "";
    const required = ["STAGING", "EVAL_FAIL_ON_REGRESSION", "LANGFUSE_SAMPLE_RATE"];
    const missing = required.filter((v) => !new RegExp(`\\b${v}\\b`).test(env));
    if (missing.length > 0) fail("env.ts ops knobs", missing.join(", "));
    else ok("env.ts declares STAGING + EVAL_FAIL_ON_REGRESSION + LANGFUSE_SAMPLE_RATE");
  }

  // 5. ops modules + suites
  {
    const required = [
      "src/server/eval/runner.ts",
      "src/server/perf/alerts.ts",
      "src/server/eval/suites/extract.signals.yaml",
    ];
    const missing = required.filter((p) => !existsSync(path.join(ROOT, p)));
    if (missing.length > 0) fail("eval + perf modules", missing.join(", "));
    else ok("/src/server/eval + /src/server/perf modules + suite present");
  }

  // 6. Inngest ops functions registered (barrel + dotted ids in source)
  {
    const barrel = readIfExists("src/server/inngest/functions/index.ts") ?? "";
    const crons = readIfExists("src/server/inngest/functions/ops.crons.ts") ?? "";
    const camel = ["evalRunNightly", "perfBudgetScan", "opsHeartbeat"];
    const dotted = ["eval.run.nightly", "perf.budget.scan", "ops.heartbeat"];
    const missingExport = camel.filter((n) => !barrel.includes(n));
    const missingId = dotted.filter((n) => !crons.includes(n));
    if (missingExport.length > 0 || missingId.length > 0) {
      fail("inngest ops functions", `missing exports=${missingExport.join(",") || "none"} ids=${missingId.join(",") || "none"}`);
    } else {
      ok("inngest barrel + ops.crons.ts register eval.run.nightly + perf.budget.scan + ops.heartbeat");
    }
  }

  // 7. /healthz returns marketplace_ttfb_ms
  {
    const route = readIfExists("src/app/healthz/route.ts") ?? "";
    if (/marketplace_ttfb_ms/.test(route)) {
      ok("/healthz returns marketplace_ttfb_ms");
    } else {
      fail("/healthz extension", "marketplace_ttfb_ms field missing");
    }
  }

  // 8. /app/ops admin page
  {
    if (!existsSync(path.join(ROOT, "src/app/app/ops/page.tsx"))) {
      fail("/app/ops admin page", "missing");
    } else {
      const page = readIfExists("src/app/app/ops/page.tsx") ?? "";
      if (/role[\s\S]{0,200}admin/.test(page)) {
        ok("/app/ops admin-gated page present");
      } else {
        fail("/app/ops admin gate", "no profiles.role check");
      }
    }
  }

  // 9. Behavioural: p95 helper
  async function tryImport<T>(rel: string): Promise<T | null> {
    const abs = path.join(ROOT, rel);
    if (!existsSync(abs)) return null;
    return (await import(abs)) as T;
  }
  {
    const mod = await tryImport<{ p95?: (xs: number[]) => number }>(
      "src/server/perf/alerts.ts",
    );
    if (mod === null || typeof mod.p95 !== "function") {
      fail("perf p95 helper", "missing");
    } else {
      const v = mod.p95([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]);
      if (v === 100) ok("perf.p95 ([1..9,100]) → 100 (p95 picks tail)");
      else fail("perf p95 helper", `got ${String(v)}`);
    }
  }

  // 10. eval runner stub
  {
    const mod = await tryImport<{
      runEvalSuite?: (n: string, v: string) => Promise<{ passed: number }>;
    }>("src/server/eval/runner.ts");
    if (mod === null || typeof mod.runEvalSuite !== "function") {
      fail("eval runner", "missing");
    } else {
      const r = await mod.runEvalSuite("extract.signals", "v1");
      if (r.passed >= 1) ok("eval runner stub: returns passed >= 1 in OBSERVABILITY_STUB mode");
      else fail("eval runner stub", JSON.stringify(r));
    }
  }

  // 11. real-env skips
  skip("migration 0007 applied to live DB", "no Supabase reachability in sandbox");
  skip("real Sentry/PostHog/Axiom/Langfuse init", "OBSERVABILITY_STUB=1 active");
  skip("pnpm eval against real LLMs", "promptfoo binary + real prompts deferred to Phase 6.5");

  // 12. regression
  {
    const sentinels = [
      "verify-phase-0.ts","verify-phase-1.ts","verify-phase-2.ts",
      "verify-phase-3.ts","verify-phase-4.ts","verify-phase-5.ts",
    ];
    const missing = sentinels.filter((s) => !existsSync(path.join(ROOT, "scripts", s)));
    if (missing.length > 0) fail("regression: phase 0-5 scripts intact", missing.join(", "));
    else ok("regression: verify-phase-0..5 scripts intact");
  }

  let okN = 0, failN = 0, skipN = 0;
  const lines: string[] = [];
  for (const r of results) {
    const mark = r.status === "ok" ? "✓" : r.status === "fail" ? "✗" : "•";
    const tail = r.detail !== undefined ? `  — ${r.detail}` : "";
    lines.push(`${mark} ${r.name}${tail}`);
    if (r.status === "ok") okN++;
    else if (r.status === "fail") failN++;
    else skipN++;
  }
  console.log(lines.join("\n"));
  console.log(`\n${String(okN)} ok, ${String(failN)} fail, ${String(skipN)} skip (${String(results.length)} total)`);
  process.exit(failN === 0 ? 0 : 1);
}

void main().catch((e: unknown) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
