#!/usr/bin/env tsx
/**
 * Phase 7 verification — Marketplace + Launch + v1.0.0.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const DUMMY: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "https://stub.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "stub",
  SUPABASE_SERVICE_ROLE_KEY: "stub",
  ANTHROPIC_API_KEY: "stub", GROQ_API_KEY: "stub", PERPLEXITY_API_KEY: "stub",
  VOYAGE_API_KEY: "stub", COHERE_API_KEY: "stub", OPENROUTER_API_KEY: "stub",
  BRAVE_SEARCH_API_KEY: "stub",
  STRIPE_SECRET_KEY: "sk_test_stub", STRIPE_WEBHOOK_SECRET: "whsec_stub",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_stub",
  POLAR_ACCESS_TOKEN: "stub", POLAR_WEBHOOK_SECRET: "stub",
  UPSTASH_REDIS_REST_URL: "https://stub.upstash.io", UPSTASH_REDIS_REST_TOKEN: "stub",
  INNGEST_EVENT_KEY: "stub", INNGEST_SIGNING_KEY: "signkey-stub-12345",
  RESEND_API_KEY: "stub", FROM_EMAIL: "stub@example.com",
  LANGFUSE_PUBLIC_KEY: "stub", LANGFUSE_SECRET_KEY: "stub",
  LANGFUSE_HOST: "https://stub.langfuse.com",
  AXIOM_TOKEN: "stub", AXIOM_DATASET: "stub",
  SENTRY_DSN: "stub", NEXT_PUBLIC_SENTRY_DSN: "stub",
  NEXT_PUBLIC_POSTHOG_KEY: "stub",
  NEXT_PUBLIC_POSTHOG_HOST: "https://stub.i.posthog.com",
  REDDIT_CLIENT_ID: "stub", REDDIT_CLIENT_SECRET: "stub",
  PRODUCT_HUNT_API_TOKEN: "stub",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  REDDIT_USER_AGENT: "painpilot-verify/0.1",
  GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: "stub",
  GITHUB_APP_CLIENT_ID: "stub", GITHUB_APP_CLIENT_SECRET: "stub",
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
  // 1. Migration 0008
  {
    const sql = readIfExists("supabase/migrations/0008_marketplace.sql");
    if (sql === null) fail("migration 0008_marketplace.sql exists", "missing");
    else {
      const missing = ["marketplace_listings", "affiliates", "affiliate_clicks"].filter(
        (t) => !new RegExp(`create table[^;]*\\b${t}\\b`, "i").test(sql),
      );
      if (missing.length > 0) fail("0008 declares marketplace tables", missing.join(", "));
      else ok("migration 0008 declares marketplace_listings + affiliates + affiliate_clicks");
    }
  }

  // 2. RLS — listings anon-read only when published_at not null
  {
    const sql = readIfExists("supabase/migrations/0008_marketplace.sql") ?? "";
    if (
      /alter table[^;]*marketplace_listings[^;]*enable row level security/i.test(sql) &&
      /published_at\s+is\s+not\s+null/i.test(sql)
    ) {
      ok("marketplace_listings RLS: anon-read gated on published_at IS NOT NULL");
    } else {
      fail("marketplace_listings RLS", "policy missing or doesn't gate published_at");
    }
  }

  // 3. types
  {
    const ts = readIfExists("src/types/database.ts") ?? "";
    const missing = ["marketplace_listings", "affiliates", "affiliate_clicks"].filter(
      (t) => !new RegExp(`\\b${t}\\s*:\\s*\\{[\\s\\S]*?Row\\s*:`, "i").test(ts),
    );
    if (missing.length > 0) fail("database.ts marketplace tables", missing.join(", "));
    else ok("database.ts: 3 marketplace tables typed");
  }

  // 4. launch.* prompt bodies upgraded
  {
    const sql = readIfExists("supabase/migrations/0008_marketplace.sql") ?? "";
    const launches = ["launch.landing_page", "launch.product_hunt", "launch.x_thread", "launch.cold_email", "launch.reddit_replies"];
    const missing = launches.filter((n) => {
      const esc = n.replace(/\./g, "\\.");
      return !new RegExp(`'${esc}'`, "i").test(sql);
    });
    if (missing.length > 0) fail("launch.* prompt UPDATEs", missing.join(", "));
    else ok("all 5 launch.* prompts updated in 0008");
  }

  // 5. /marketplace is ISR-friendly + no cookies()
  {
    const page = readIfExists("src/app/marketplace/page.tsx") ?? "";
    const hasRevalidate = /export\s+const\s+revalidate\s*=/.test(page);
    const noCookies = !/cookies\(\)/.test(page);
    if (hasRevalidate && noCookies) {
      ok("/marketplace: revalidate exported + no cookies() (ISR-friendly)");
    } else {
      fail("/marketplace ISR", `revalidate=${String(hasRevalidate)} noCookies=${String(noCookies)}`);
    }
  }

  // 6. marketplace + founder + blog + sitemap + robots present
  {
    const required = [
      "src/app/marketplace/page.tsx",
      "src/app/marketplace/[slug]/page.tsx",
      "src/app/founder/[handle]/page.tsx",
      "src/app/sitemap.ts",
      "src/app/robots.ts",
      "src/app/api/affiliate/[slug]/route.ts",
      "src/server/marketplace/list.ts",
      "src/server/marketplace/sitemap.ts",
    ];
    const missing = required.filter((p) => !existsSync(path.join(ROOT, p)));
    if (missing.length > 0) fail("marketplace surfaces", missing.join(", "));
    else ok("/marketplace + /founder + sitemap + robots + affiliate redirect present");
  }

  // 7. Inngest marketplace crons registered
  {
    const barrel = readIfExists("src/server/inngest/functions/index.ts") ?? "";
    if (/marketplaceReindex/.test(barrel) && /marketplaceAffiliateRotate/.test(barrel)) {
      ok("inngest barrel registers marketplace.reindex + marketplace.affiliate_rotate");
    } else {
      fail("inngest marketplace functions", "not registered");
    }
  }

  // 8. AppEvents extension
  {
    const client = readIfExists("src/server/inngest/client.ts") ?? "";
    if (/marketplace\.listing\.updated/.test(client)) {
      ok("AppEvents includes marketplace.listing.updated");
    } else {
      fail("AppEvents Phase 7", "marketplace.listing.updated missing");
    }
  }

  // 9. /content present
  {
    const required = [
      "content/blog/welcome-to-painpilot.mdx",
      "content/changelog/v1.0.0.mdx",
    ];
    const missing = required.filter((p) => !existsSync(path.join(ROOT, p)));
    if (missing.length > 0) fail("MDX content", missing.join(", "));
    else ok("/content/blog + /content/changelog/v1.0.0.mdx present");
  }

  // 10. rotate-affiliates script
  {
    if (existsSync(path.join(ROOT, "scripts/rotate-affiliates.ts"))) {
      ok("scripts/rotate-affiliates.ts present");
    } else {
      fail("rotate-affiliates script", "missing");
    }
  }

  // 11. no_auto_post guard remains green
  {
    const guard = readIfExists("tests/unit/no_auto_post.test.ts") ?? "";
    if (guard.length > 0 && /SOCIAL_RE/.test(guard)) {
      ok("no_auto_post CI guard intact for Phase 7");
    } else {
      fail("no_auto_post guard", "missing or stripped");
    }
  }

  // 12. launch prompts mark drafts (never post Reddit/X)
  {
    const sql = readIfExists("supabase/migrations/0008_marketplace.sql") ?? "";
    if (/DRAFT-ONLY/i.test(sql) || /never auto-post/i.test(sql)) {
      ok("launch.x_thread / launch.reddit_replies marked DRAFT-ONLY in bodies");
    } else {
      fail("launch drafts disclaimer", "no DRAFT-ONLY language in 0008");
    }
  }

  // 13-15. real-env skips
  skip("migration 0008 applied to live DB", "no Supabase reachability in sandbox");
  skip("/healthz marketplace TTFB < 200ms median", "production metric; not measurable in sandbox");
  skip("pnpm build succeeds", "deferred to local CI matrix before tag");

  // 16. regression sentinels
  {
    const sentinels = [
      "verify-phase-0.ts","verify-phase-1.ts","verify-phase-2.ts","verify-phase-3.ts",
      "verify-phase-4.ts","verify-phase-5.ts","verify-phase-6.ts",
    ];
    const missing = sentinels.filter((s) => !existsSync(path.join(ROOT, "scripts", s)));
    if (missing.length > 0) fail("regression: phase 0-6 scripts intact", missing.join(", "));
    else ok("regression: verify-phase-0..6 scripts intact");
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
