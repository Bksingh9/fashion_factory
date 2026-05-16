#!/usr/bin/env tsx
/**
 * Phase 5 verification — "Operate" exit criteria.
 *
 * Polar marketplace + per-product metrics + monthly payouts.
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
  // 1. Migration 0006 + tables
  {
    const sql = readIfExists("supabase/migrations/0006_operate.sql");
    if (sql === null) fail("migration 0006_operate.sql exists", "missing");
    else {
      const tables = ["products", "product_metrics", "product_events", "payouts"];
      const missing = tables.filter((t) => !new RegExp(`create table[^;]*\\b${t}\\b`, "i").test(sql));
      if (missing.length > 0) fail("0006 declares operate tables", missing.join(", "));
      else ok("migration 0006 declares all 4 operate tables");
    }
  }

  // 2. RLS
  {
    const sql = readIfExists("supabase/migrations/0006_operate.sql") ?? "";
    const tables = ["products", "product_metrics", "product_events", "payouts"];
    const noRls = tables.filter((t) =>
      !new RegExp(`alter table[^;]*\\b${t}\\b[^;]*enable row level security`, "i").test(sql),
    );
    if (noRls.length > 0) fail("RLS on 4 operate tables", `missing: ${noRls.join(", ")}`);
    else ok("RLS enabled on all 4 operate tables");
  }

  // 3. types
  {
    const ts = readIfExists("src/types/database.ts") ?? "";
    const missing = ["products", "product_metrics", "product_events", "payouts"].filter(
      (t) => !new RegExp(`\\b${t}\\s*:\\s*\\{[\\s\\S]*?Row\\s*:`, "i").test(ts),
    );
    if (missing.length > 0) fail("database.ts operate tables", missing.join(", "));
    else ok("database.ts: operate tables typed");
  }

  // 4. server modules
  {
    const required = [
      "src/server/payments/polar.ts",
      "src/server/payments/revenue.ts",
    ];
    const missing = required.filter((p) => !existsSync(path.join(ROOT, p)));
    if (missing.length > 0) fail("polar + revenue modules", missing.join(", "));
    else ok("/src/server/payments/polar.ts + revenue.ts present");
  }

  // 5. Inngest functions registered
  {
    const barrel = readIfExists("src/server/inngest/functions/index.ts") ?? "";
    const required = ["polar.event.ingest", "product.metrics.snapshot", "payouts.compute"];
    const missing = required.filter((n) => !barrel.includes(n));
    if (missing.length > 0) fail("inngest operate functions", missing.join(", "));
    else ok("inngest barrel registers polar.event.ingest + metrics.snapshot + payouts.compute");
  }

  // 6. AppEvents
  {
    const client = readIfExists("src/server/inngest/client.ts") ?? "";
    const required = ["polar.event.received", "product.publish.requested"];
    const missing = required.filter((e) => !client.includes(e));
    if (missing.length > 0) fail("AppEvents Phase 5", missing.join(", "));
    else ok("AppEvents includes polar.event.received + product.publish.requested");
  }

  // 7. webhook route
  {
    if (!existsSync(path.join(ROOT, "src/app/api/polar/webhook/route.ts"))) {
      fail("/api/polar/webhook route", "missing");
    } else {
      ok("/api/polar/webhook route present");
    }
  }

  // 8. UI
  {
    const required = [
      "src/app/app/products/page.tsx",
      "src/app/app/products/[id]/page.tsx",
      "src/app/app/payouts/page.tsx",
    ];
    const missing = required.filter((p) => !existsSync(path.join(ROOT, p)));
    if (missing.length > 0) fail("products + payouts UI", missing.join(", "));
    else ok("/app/products + /app/payouts UI present");
  }

  // 9. computePayout behavioural
  async function tryImport<T>(rel: string): Promise<T | null> {
    const abs = path.join(ROOT, rel);
    if (!existsSync(abs)) return null;
    return (await import(abs)) as T;
  }
  {
    const mod = await tryImport<{
      computePayout?: (g: number, bps: number) => { gross_usd: number; fee_usd: number; net_usd: number };
    }>("src/server/payments/revenue.ts");
    if (mod === null || typeof mod.computePayout !== "function") {
      fail("computePayout export", "missing");
    } else {
      const r = mod.computePayout(100, 1000);
      if (r.fee_usd === 10 && r.net_usd === 90) {
        ok("computePayout: 10% bps → 90% net (100 → 90)");
      } else {
        fail("computePayout 10%", `got fee=${String(r.fee_usd)} net=${String(r.net_usd)}`);
      }
    }
  }

  // 10. Polar signature verifier behavioural
  {
    const mod = await tryImport<{
      verifyPolarSignature?: (body: string, sig: string | null, secret: string) => boolean;
    }>("src/server/payments/polar.ts");
    if (mod === null || typeof mod.verifyPolarSignature !== "function") {
      fail("verifyPolarSignature export", "missing");
    } else {
      const { createHmac } = await import("node:crypto");
      const body = "{\"id\":\"evt_x\"}";
      const secret = "polar-secret";
      const good = createHmac("sha256", secret).update(body).digest("base64");
      const goodOk = mod.verifyPolarSignature(body, good, secret);
      const badOk = mod.verifyPolarSignature(body, "bad", secret);
      if (goodOk === true && badOk === false) {
        ok("verifyPolarSignature: accepts good, rejects bad");
      } else {
        fail("verifyPolarSignature", `good=${String(goodOk)} bad=${String(badOk)}`);
      }
    }
  }

  // 11. real-env skips
  skip("migration 0006 applied to live DB", "no Supabase reachability in sandbox");
  skip("real Polar webhook end-to-end", "POLAR_STUB=1 active; unset to probe");

  // 12. regression
  {
    const sentinels = ["verify-phase-0.ts", "verify-phase-1.ts", "verify-phase-2.ts", "verify-phase-3.ts", "verify-phase-4.ts"];
    const missing = sentinels.filter((s) => !existsSync(path.join(ROOT, "scripts", s)));
    if (missing.length > 0) fail("regression: phase 0-4 scripts intact", missing.join(", "));
    else ok("regression: verify-phase-0..4 scripts intact");
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
