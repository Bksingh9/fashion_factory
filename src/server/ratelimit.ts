/**
 * Rate limiting.
 *
 * - `limitLlm(userId, plan)` — sliding 24h window. Caps from invariants:
 *     free=20, pro=500, studio=2500, agency=10000.
 * - `limitCrawl(source)` — sliding 60s window. Caps:
 *     reddit=8, hn=30, ph=10, app_store=20, trustpilot=10, g2=10, ih=10.
 *
 * Real backend: Upstash Ratelimit. `RATELIMIT_STUB=1` swaps for an
 * in-memory implementation. The in-memory limiter is process-local — useful
 * for unit tests and verify-phase-1 in a credential-less sandbox; do NOT
 * rely on it across server instances.
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/env";
import type { CrawlSourceId, Plan } from "@/types/database";

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

const LLM_PLAN_LIMITS: Record<Plan, number> = {
  free: 20,
  pro: 500,
  studio: 2500,
  agency: 10000,
};

// Canonical union lives in /src/types/database.ts (mirrors the
// crawl_sources.id check constraint). Re-export to keep the existing
// `import { CrawlSource } from "@/server/ratelimit"` callsites working.
export type CrawlSource = CrawlSourceId;

const CRAWL_RPM_LIMITS: Record<CrawlSource, number> = {
  reddit: 8,
  hn: 30,
  ph: 10,
  app_store: 20,
  play_store: 15,
  trustpilot: 10,
  g2: 10,
  ih: 10,
};

function isStubbed(): boolean {
  return process.env.RATELIMIT_STUB === "1";
}

// ---------- Upstash backend ----------

let redisCached: Redis | null = null;
function redis(): Redis {
  if (redisCached !== null) return redisCached;
  redisCached = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return redisCached;
}

const llmLimiters = new Map<Plan, Ratelimit>();
function llmLimiter(plan: Plan): Ratelimit {
  const cached = llmLimiters.get(plan);
  if (cached !== undefined) return cached;
  const limiter = new Ratelimit({
    redis: redis(),
    limiter: Ratelimit.slidingWindow(LLM_PLAN_LIMITS[plan], "24 h"),
    prefix: `rl:llm:${plan}`,
    analytics: false,
  });
  llmLimiters.set(plan, limiter);
  return limiter;
}

const crawlLimiters = new Map<CrawlSource, Ratelimit>();
function crawlLimiter(source: CrawlSource): Ratelimit {
  const cached = crawlLimiters.get(source);
  if (cached !== undefined) return cached;
  const limiter = new Ratelimit({
    redis: redis(),
    limiter: Ratelimit.slidingWindow(CRAWL_RPM_LIMITS[source], "60 s"),
    prefix: `rl:crawl:${source}`,
    analytics: false,
  });
  crawlLimiters.set(source, limiter);
  return limiter;
}

// ---------- In-memory backend (stub) ----------

interface MemoryWindow {
  hits: number[]; // millisecond timestamps within the window
  windowMs: number;
  limit: number;
}
const memory = new Map<string, MemoryWindow>();
let clockOverride: number | null = null;

/** Tests can advance a fake clock without touching real time. */
export function setRateLimitClockMs(ms: number | null): void {
  clockOverride = ms;
}
export function resetRateLimitStub(): void {
  memory.clear();
  clockOverride = null;
}
function now(): number {
  return clockOverride ?? Date.now();
}

function memoryConsume(key: string, limit: number, windowMs: number): RateLimitResult {
  const t = now();
  const win = memory.get(key) ?? { hits: [], windowMs, limit };
  // Drop hits that have aged out.
  const cutoff = t - windowMs;
  win.hits = win.hits.filter((ts) => ts > cutoff);

  if (win.hits.length >= limit) {
    memory.set(key, win);
    return {
      success: false,
      remaining: 0,
      reset: (win.hits[0] ?? t) + windowMs,
    };
  }
  win.hits.push(t);
  memory.set(key, win);
  return {
    success: true,
    remaining: limit - win.hits.length,
    reset: t + windowMs,
  };
}

// ---------- Public API ----------

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

export async function limitLlm(userId: string, plan: Plan): Promise<RateLimitResult> {
  if (isStubbed()) {
    return memoryConsume(`rl:llm:${plan}:${userId}`, LLM_PLAN_LIMITS[plan], DAY_MS);
  }
  const r = await llmLimiter(plan).limit(userId);
  return { success: r.success, remaining: r.remaining, reset: r.reset };
}

export async function limitCrawl(source: CrawlSource): Promise<RateLimitResult> {
  if (isStubbed()) {
    return memoryConsume(`rl:crawl:${source}`, CRAWL_RPM_LIMITS[source], MIN_MS);
  }
  const r = await crawlLimiter(source).limit(source);
  return { success: r.success, remaining: r.remaining, reset: r.reset };
}

export const __testing = {
  LLM_PLAN_LIMITS,
  CRAWL_RPM_LIMITS,
};
