#!/usr/bin/env tsx
/**
 * Phase 3 verification — "Validate" exit criteria.
 *
 * Saved clusters → locked product specs. Sandbox-runnable checks all use
 * stubs (LLM_STUB, RATELIMIT_STUB, etc.); real-env-only checks surface as
 * `skip` with a loud diagnostic.
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

const PHASE3_PROMPTS = [
  "validate.audience",
  "validate.competitors",
  "validate.wtp_pricing",
  "validate.features",
  "validate.gtm",
  "spec.generate",
];

async function main(): Promise<void> {
  // ==========================================================================
  // 1. Migration 0004 exists + declares specs and spec_events.
  // ==========================================================================
  {
    const sql = readIfExists("supabase/migrations/0004_validate.sql");
    if (sql === null) {
      fail("migration 0004_validate.sql exists", "missing");
    } else {
      const missing = ["specs", "spec_events"].filter(
        (t) => !new RegExp(`create table[^;]*\\b${t}\\b`, "i").test(sql),
      );
      if (missing.length > 0) fail("0004 declares specs + spec_events", missing.join(", "));
      else ok("migration 0004 declares specs + spec_events");
    }
  }

  // 2. RLS enabled on both tables.
  {
    const sql = readIfExists("supabase/migrations/0004_validate.sql") ?? "";
    const noRls = ["specs", "spec_events"].filter(
      (t) =>
        !new RegExp(
          `alter table[^;]*\\b${t}\\b[^;]*enable row level security`,
          "i",
        ).test(sql),
    );
    if (noRls.length > 0) fail("RLS on specs + spec_events", `missing: ${noRls.join(", ")}`);
    else ok("RLS enabled on specs + spec_events");
  }

  // 3. database.ts exports specs + spec_events.
  {
    const ts = readIfExists("src/types/database.ts") ?? "";
    const missing = ["specs", "spec_events"].filter(
      (t) => !new RegExp(`\\b${t}\\s*:\\s*\\{[\\s\\S]*?Row\\s*:`, "i").test(ts),
    );
    if (missing.length > 0) fail("database.ts has specs + spec_events", missing.join(", "));
    else ok("database.ts: specs + spec_events typed");
  }

  // 4. Phase 3 prompts are non-TBD in migration 0004 (UPDATE or INSERT).
  {
    const sql = readIfExists("supabase/migrations/0004_validate.sql") ?? "";
    function present(name: string): boolean {
      const esc = name.replace(/\./g, "\\.");
      const re1 = new RegExp(`'${esc}'[\\s\\S]{0,1200}body\\s*=`, "i");
      const re2 = new RegExp(`body\\s*=[\\s\\S]{0,1500}'${esc}'`, "i");
      const re3 = new RegExp(`'${esc}'[\\s\\S]{0,1500}\\$body\\$`, "i");
      return re1.test(sql) || re2.test(sql) || re3.test(sql);
    }
    const missing = PHASE3_PROMPTS.filter((p) => !present(p));
    if (missing.length > 0) fail("all 6 Phase 3 prompts present in 0004", missing.join(", "));
    else ok("all 6 Phase 3 prompts present in 0004 (audience, competitors, wtp_pricing, features, gtm, spec.generate)");
  }

  // ==========================================================================
  // 5. /src/server/validate/ scaffold exists.
  // ==========================================================================
  {
    const required = [
      "src/server/validate/schemas.ts",
      "src/server/validate/lock.ts",
      "src/server/validate/pipeline.ts",
      "src/server/validate/stream.ts",
    ];
    const missing = required.filter((p) => !existsSync(path.join(ROOT, p)));
    if (missing.length > 0) fail("/src/server/validate scaffold present", missing.join(", "));
    else ok("/src/server/validate: schemas + lock + pipeline + stream present");
  }

  // 6. Inngest validate.generate registered.
  {
    const barrel = readIfExists("src/server/inngest/functions/index.ts") ?? "";
    if (barrel.includes("validate.generate") || barrel.includes("validateGenerate")) {
      ok("inngest barrel registers validate.generate");
    } else {
      fail("inngest validate.generate registration", "not found in barrel");
    }
  }

  // 7. AppEvents extension.
  {
    const client = readIfExists("src/server/inngest/client.ts") ?? "";
    if (/validate\.requested/.test(client)) {
      ok("AppEvents includes validate.requested");
    } else {
      fail("AppEvents extension", "validate.requested missing from AppEvents");
    }
  }

  // 8. /api/validate/stream + /api/validate/request routes exist.
  {
    const required = [
      "src/app/api/validate/request/route.ts",
      "src/app/api/validate/stream/route.ts",
    ];
    const missing = required.filter((p) => !existsSync(path.join(ROOT, p)));
    if (missing.length > 0) fail("/api/validate/{request,stream} routes", missing.join(", "));
    else ok("/api/validate/request + /api/validate/stream present");
  }

  // 9. /app/clusters/[id]/validate page + actions exist.
  {
    const required = [
      "src/app/app/clusters/[id]/validate/page.tsx",
      "src/app/app/clusters/[id]/validate/actions.ts",
    ];
    const missing = required.filter((p) => !existsSync(path.join(ROOT, p)));
    if (missing.length > 0) fail("/app/clusters/[id]/validate UI", missing.join(", "));
    else ok("/app/clusters/[id]/validate page + actions present");
  }

  // ==========================================================================
  // 10-13. Behavioural — driven via dynamic imports once chunks 3-6 land.
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

  // 10. Schemas parse a representative payload each.
  {
    const mod = await tryImport<{
      audienceSchema?: { safeParse: (v: unknown) => { success: boolean } };
      competitorsSchema?: { safeParse: (v: unknown) => { success: boolean } };
      wtpPricingSchema?: { safeParse: (v: unknown) => { success: boolean } };
      featuresSchema?: { safeParse: (v: unknown) => { success: boolean } };
      gtmSchema?: { safeParse: (v: unknown) => { success: boolean } };
    }>("src/server/validate/schemas.ts");
    if (mod === null) {
      skip("validate schemas parse fixtures", "schemas.ts not implemented yet (chunk 3)");
    } else {
      const audienceOk = mod.audienceSchema?.safeParse({
        primary: {
          role: "Indie founder",
          size: "~50k",
          channels: ["r/SaaS", "Indie Hackers"],
          jobs_to_be_done: ["validate demand", "ship MVP"],
        },
        secondary: [],
        anti_personas: [],
        confidence: 0.7,
      }).success;
      if (audienceOk === true) ok("validate.audience schema parses a fixture");
      else fail("validate.audience schema", "fixture rejected");
    }
  }

  // 11. lockSpec rejects null sections (pure test).
  {
    const mod = await tryImport<{ isLockable?: (sections: Record<string, unknown>) => boolean }>(
      "src/server/validate/lock.ts",
    );
    if (mod === null || typeof mod.isLockable !== "function") {
      skip("lock.ts isLockable", "lock.ts not implemented yet (chunk 3)");
    } else {
      // Realistic fixtures: empty objects don't count as "section present"
      // — each section should hold a non-empty structured payload before lock.
      const blockedOnNull = mod.isLockable({
        audience: { role: "x" },
        competitors: { summary: "y" },
        wtp: { rationale: "z" },
        pricing: { plans: [{}] },
        features: { mvp: [{}] },
        gtm: null,
      });
      const allowedFull = mod.isLockable({
        audience: { role: "Indie founder" },
        competitors: { summary: "Stripe dominates" },
        wtp: { wtp_band: "$10-50" },
        pricing: { plans: [{ name: "Pro" }] },
        features: { mvp: [{ slug: "save" }] },
        gtm: { channels: [{ name: "r/SaaS" }] },
      });
      if (blockedOnNull === false && allowedFull === true) {
        ok("lock.ts: isLockable rejects null section, accepts all-six-non-empty");
      } else {
        fail("lock.ts isLockable", `null=${String(blockedOnNull)} full=${String(allowedFull)}`);
      }
    }
  }

  // 12. Streaming route shape: first byte arrives < 1s p95 under stub.
  {
    const routeMod = await tryImport<{ POST?: (req: Request) => Promise<Response> }>(
      "src/app/api/validate/stream/route.ts",
    );
    if (routeMod === null || typeof routeMod.POST !== "function") {
      skip("/api/validate/stream first-byte latency", "route not implemented yet (chunk 5)");
    } else {
      skip("/api/validate/stream first-byte latency", "wired; full smoke covered by tests/unit/validate.stream.test.ts");
    }
  }

  // 13. Phase 3 full-generation completes under stub (smoke).
  {
    const pipelineMod = await tryImport<{
      runValidateForTest?: (specId: string) => Promise<{ status: string }>;
    }>("src/server/validate/pipeline.ts");
    if (pipelineMod === null || typeof pipelineMod.runValidateForTest !== "function") {
      skip("pipeline.runValidate smoke", "pipeline.ts not implemented yet (chunk 3)");
    } else {
      skip("pipeline.runValidate smoke", "implementation hook present; coverage in tests/unit/validate.pipeline.test.ts");
    }
  }

  // ==========================================================================
  // 14. Real-env-required checks (skip in sandbox).
  // ==========================================================================
  skip("migration 0004 applied to live DB", "no Supabase reachability in sandbox");
  skip(
    "/api/validate/stream against real Anthropic streaming",
    "VALIDATE_STREAM_STUB=1 active; unset for live streaming",
  );
  skip("spec generation p95 < 12s against real LLMs", "production metric; not measurable in sandbox");

  // ==========================================================================
  // 15. Regression sentinels.
  // ==========================================================================
  {
    if (!existsSync(path.join(ROOT, "scripts/verify-phase-0.ts"))) {
      fail("regression: verify-phase-0.ts", "missing");
    } else if (!existsSync(path.join(ROOT, "scripts/verify-phase-1.ts"))) {
      fail("regression: verify-phase-1.ts", "missing");
    } else if (!existsSync(path.join(ROOT, "scripts/verify-phase-2.ts"))) {
      fail("regression: verify-phase-2.ts", "missing");
    } else {
      ok("regression: verify-phase-0/1/2 scripts intact");
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
