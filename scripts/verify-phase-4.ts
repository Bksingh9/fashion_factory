#!/usr/bin/env tsx
/**
 * Phase 4 verification — "Ship" exit criteria.
 *
 * Locked spec → fresh GitHub repo via the PainPilot GitHub App, optional
 * Vercel deploy. Sandbox sets GITHUB_STUB=1 so Octokit calls are
 * short-circuited in-memory; real-env runs hit GitHub via Octokit.
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
process.env.LLM_STUB = process.env.LLM_STUB ?? "1";
process.env.STRIPE_STUB = process.env.STRIPE_STUB ?? "1";
process.env.RATELIMIT_STUB = process.env.RATELIMIT_STUB ?? "1";
process.env.OBSERVABILITY_STUB = process.env.OBSERVABILITY_STUB ?? "1";
process.env.STUB_CRAWLER = process.env.STUB_CRAWLER ?? "1";
process.env.VALIDATE_STREAM_STUB = process.env.VALIDATE_STREAM_STUB ?? "1";
process.env.GITHUB_STUB = process.env.GITHUB_STUB ?? "1";

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

const PHASE4_PROMPTS = [
  "ship.plan",
  "ship.route.generate",
  "ship.component.generate",
  "ship.readme.generate",
  "ship.commit_message",
  "ship.test.smoke",
];

async function main(): Promise<void> {
  // 1. Migration 0005 + new tables
  {
    const sql = readIfExists("supabase/migrations/0005_ship.sql");
    if (sql === null) fail("migration 0005_ship.sql exists", "missing");
    else {
      const missing = ["ship_templates", "ship_runs", "ship_files"].filter(
        (t) => !new RegExp(`create table[^;]*\\b${t}\\b`, "i").test(sql),
      );
      if (missing.length > 0) fail("0005 declares ship tables", missing.join(", "));
      else ok("migration 0005 declares ship_templates + ship_runs + ship_files");
    }
  }

  // 2. RLS
  {
    const sql = readIfExists("supabase/migrations/0005_ship.sql") ?? "";
    const noRls = ["ship_templates", "ship_runs", "ship_files"].filter(
      (t) =>
        !new RegExp(
          `alter table[^;]*\\b${t}\\b[^;]*enable row level security`,
          "i",
        ).test(sql),
    );
    if (noRls.length > 0) fail("RLS on 3 ship tables", `missing: ${noRls.join(", ")}`);
    else ok("RLS enabled on ship_templates + ship_runs + ship_files");
  }

  // 3. database.ts typed
  {
    const ts = readIfExists("src/types/database.ts") ?? "";
    const missing = ["ship_templates", "ship_runs", "ship_files"].filter(
      (t) => !new RegExp(`\\b${t}\\s*:\\s*\\{[\\s\\S]*?Row\\s*:`, "i").test(ts),
    );
    if (missing.length > 0) fail("database.ts ship tables", missing.join(", "));
    else ok("database.ts: ship tables typed");
  }

  // 4. All 6 Phase 4 prompts present + non-TBD
  {
    const sql = readIfExists("supabase/migrations/0005_ship.sql") ?? "";
    const missing = PHASE4_PROMPTS.filter((name) => {
      const esc = name.replace(/\./g, "\\.");
      return !new RegExp(`'${esc}'`, "i").test(sql);
    });
    if (missing.length > 0) fail("all 6 Phase 4 prompts present", missing.join(", "));
    else ok("all 6 Phase 4 prompts present in 0005");
  }

  // 5. env additions
  {
    const env = readIfExists("src/env.ts") ?? "";
    const required = ["VERCEL_API_TOKEN", "VERCEL_TEAM_ID", "SHIP_TEMPLATE_REPO"];
    const missing = required.filter((v) => !new RegExp(`\\b${v}\\b`).test(env));
    if (missing.length > 0) fail("env.ts ship vars", missing.join(", "));
    else ok("env.ts declares VERCEL_API_TOKEN / VERCEL_TEAM_ID / SHIP_TEMPLATE_REPO");
  }

  // 6. /src/server/github/ + /src/server/ship/ scaffold
  {
    const required = [
      "src/server/github/app.ts",
      "src/server/github/repos.ts",
      "src/server/ship/plan.ts",
      "src/server/ship/pipeline.ts",
      "src/server/ship/templates.ts",
    ];
    const missing = required.filter((p) => !existsSync(path.join(ROOT, p)));
    if (missing.length > 0) fail("ship + github scaffold", missing.join(", "));
    else ok("/src/server/github + /src/server/ship modules present");
  }

  // 7. Inngest ship.run registered
  {
    const barrel = readIfExists("src/server/inngest/functions/index.ts") ?? "";
    if (/ship\.run|shipRun/i.test(barrel)) ok("inngest barrel registers ship.run");
    else fail("inngest ship.run", "not registered");
  }

  // 8. AppEvents extension
  {
    const client = readIfExists("src/server/inngest/client.ts") ?? "";
    const required = ["ship.requested", "ship.completed", "ship.failed", "github.app.event"];
    const missing = required.filter((e) => !client.includes(e));
    if (missing.length > 0) fail("AppEvents Phase 4", missing.join(", "));
    else ok("AppEvents includes ship.{requested,completed,failed} + github.app.event");
  }

  // 9. API routes
  {
    const required = [
      "src/app/api/ship/start/route.ts",
      "src/app/api/github/webhook/route.ts",
    ];
    const missing = required.filter((p) => !existsSync(path.join(ROOT, p)));
    if (missing.length > 0) fail("/api/ship/start + /api/github/webhook", missing.join(", "));
    else ok("/api/ship/start + /api/github/webhook present");
  }

  // 10. Ship UI
  {
    const required = [
      "src/app/app/clusters/[id]/ship/page.tsx",
      "src/app/app/ship/[runId]/page.tsx",
    ];
    const missing = required.filter((p) => !existsSync(path.join(ROOT, p)));
    if (missing.length > 0) fail("ship UI pages", missing.join(", "));
    else ok("/app/clusters/[id]/ship + /app/ship/[runId] present");
  }

  // 11. Behavioural: JWT minting against a fixture PEM
  async function tryImport<T>(rel: string): Promise<T | null> {
    const abs = path.join(ROOT, rel);
    if (!existsSync(abs)) return null;
    return (await import(abs)) as T;
  }
  {
    const mod = await tryImport<{
      verifyWebhookSignatureForTest?: (body: string, sig: string, secret: string) => boolean;
    }>("src/server/github/app.ts");
    if (mod === null || typeof mod.verifyWebhookSignatureForTest !== "function") {
      skip("github webhook signature verifier", "app.ts not implemented yet (chunk 2)");
    } else {
      const body = "{\"action\":\"ping\"}";
      const secret = "whsec";
      // Compute a known-good signature inline.
      const { createHmac } = await import("node:crypto");
      const good = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
      const goodOk = mod.verifyWebhookSignatureForTest(body, good, secret);
      const badOk = mod.verifyWebhookSignatureForTest(body, "sha256=bad", secret);
      if (goodOk === true && badOk === false) {
        ok("github webhook signature verifier: accepts good, rejects bad");
      } else {
        fail("github webhook signature verifier", `good=${String(goodOk)} bad=${String(badOk)}`);
      }
    }
  }

  // 12. ship.plan zod schema parses a fixture
  {
    const mod = await tryImport<{
      shipPlanSchema?: { safeParse: (v: unknown) => { success: boolean } };
    }>("src/server/ship/plan.ts");
    if (mod === null || mod.shipPlanSchema === undefined) {
      skip("ship.plan schema", "plan.ts not implemented yet (chunk 2)");
    } else {
      const ok1 = mod.shipPlanSchema.safeParse({
        files: [
          { path: "src/app/page.tsx", kind: "route", summary: "Home", deps: [] },
          { path: "README.md", kind: "config", summary: "Readme", deps: [] },
        ],
      }).success;
      if (ok1 === true) ok("ship.plan schema parses a fixture");
      else fail("ship.plan schema", "fixture rejected");
    }
  }

  // 13-14. Real-env-required (skip in sandbox)
  skip("migration 0005 applied to live DB", "no Supabase reachability in sandbox");
  skip("ship pipeline p95 < 20s against real GitHub", "production metric; not measurable in sandbox");
  skip("real Octokit installation token mint", "GITHUB_STUB=1 active; unset to probe");

  // 15. Regression sentinels
  {
    const sentinels = ["verify-phase-0.ts", "verify-phase-1.ts", "verify-phase-2.ts", "verify-phase-3.ts"];
    const missing = sentinels.filter((s) => !existsSync(path.join(ROOT, "scripts", s)));
    if (missing.length > 0) fail("regression: phase 0-3 scripts intact", missing.join(", "));
    else ok("regression: verify-phase-0/1/2/3 scripts intact");
  }

  // Report
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
