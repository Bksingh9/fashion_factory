/**
 * GET /healthz — liveness + dependency reachability.
 *
 * Runs every external dependency check in parallel with a 4s per-call timeout.
 * Returns 200 only when every sub-check is green; 503 otherwise. The JSON body
 * is `{ ok, checks: { [name]: { ok, latencyMs, error?, stubbed? } } }`.
 *
 * HEALTHZ_STUB=1: every sub-check is faked (200ms-ish, ok=true, stubbed=true).
 * Intended for credential-free environments (fresh sandboxes, CI without
 * provider keys). The route logs a loud warning every time it stubs, so it
 * is never silent. Do NOT set this in production.
 */
import { env } from "@/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CheckResult = {
  ok: boolean;
  latencyMs: number;
  error?: string;
  stubbed?: boolean;
};

const TIMEOUT_MS = 4000;

function isStubbed(): boolean {
  return process.env.HEALTHZ_STUB === "1";
}

function stubResult(name: string): CheckResult {
  // Loud warning. The invariants forbid silent failure; stub mode is loud.
  console.warn(
    `[healthz] STUBBED sub-check "${name}" (HEALTHZ_STUB=1). NEVER ship to prod.`,
  );
  return {
    ok: true,
    latencyMs: 20 + Math.floor(Math.random() * 30),
    stubbed: true,
  };
}

async function timed(
  fn: (signal: AbortSignal) => Promise<{ ok: boolean; error?: string }>,
): Promise<CheckResult> {
  const t0 = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    ctrl.abort();
  }, TIMEOUT_MS);
  try {
    const out = await fn(ctrl.signal);
    const latencyMs = Math.round(performance.now() - t0);
    if (out.error !== undefined) {
      return { ok: out.ok, latencyMs, error: out.error };
    }
    return { ok: out.ok, latencyMs };
  } catch (e) {
    const latencyMs = Math.round(performance.now() - t0);
    const error =
      e instanceof Error
        ? e.name === "AbortError"
          ? `timeout after ${String(TIMEOUT_MS)}ms`
          : e.message
        : String(e);
    return { ok: false, latencyMs, error };
  } finally {
    clearTimeout(timer);
  }
}

function reachableStatus(name: string, status: number): {
  ok: boolean;
  error?: string;
} {
  // Anything < 500 means the server is reachable and routing/auth path works.
  // 5xx means the upstream is degraded. We don't fail on 401/403/404 because
  // some providers don't expose a public health endpoint; the network path is
  // what we actually want to verify here.
  if (status < 500) return { ok: true };
  return { ok: false, error: `${name}: HTTP ${String(status)}` };
}

async function checkSupabase(): Promise<CheckResult> {
  if (isStubbed()) return stubResult("supabase");
  return timed(async (signal) => {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      signal,
    });
    return reachableStatus("supabase", res.status);
  });
}

async function checkUpstash(): Promise<CheckResult> {
  if (isStubbed()) return stubResult("upstash");
  return timed(async (signal) => {
    const res = await fetch(`${env.UPSTASH_REDIS_REST_URL}/ping`, {
      headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` },
      signal,
    });
    if (!res.ok) return { ok: false, error: `upstash: HTTP ${String(res.status)}` };
    const body = (await res.json()) as { result?: unknown };
    if (body.result !== "PONG") {
      return { ok: false, error: `upstash: unexpected body ${JSON.stringify(body)}` };
    }
    return { ok: true };
  });
}

async function checkGroq(): Promise<CheckResult> {
  if (isStubbed()) return stubResult("groq");
  return timed(async (signal) => {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
      signal,
    });
    return reachableStatus("groq", res.status);
  });
}

async function checkAnthropic(): Promise<CheckResult> {
  if (isStubbed()) return stubResult("anthropic");
  return timed(async (signal) => {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      signal,
    });
    return reachableStatus("anthropic", res.status);
  });
}

async function checkPerplexity(): Promise<CheckResult> {
  if (isStubbed()) return stubResult("perplexity");
  // Perplexity has no public health endpoint. We verify the network path and
  // auth surface by hitting the chat-completions endpoint with HEAD-ish intent
  // (no body) — a 4xx response is fine, it means the server is reachable and
  // auth was processed. A 5xx is a real outage.
  return timed(async (signal) => {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal,
    });
    return reachableStatus("perplexity", res.status);
  });
}

async function checkVoyage(): Promise<CheckResult> {
  if (isStubbed()) return stubResult("voyage");
  return timed(async (signal) => {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal,
    });
    return reachableStatus("voyage", res.status);
  });
}

async function checkCohere(): Promise<CheckResult> {
  if (isStubbed()) return stubResult("cohere");
  return timed(async (signal) => {
    const res = await fetch("https://api.cohere.com/v1/models", {
      headers: { Authorization: `Bearer ${env.COHERE_API_KEY}` },
      signal,
    });
    return reachableStatus("cohere", res.status);
  });
}

async function checkOpenRouter(): Promise<CheckResult> {
  if (isStubbed()) return stubResult("openrouter");
  return timed(async (signal) => {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
      signal,
    });
    return reachableStatus("openrouter", res.status);
  });
}

async function checkBrave(): Promise<CheckResult> {
  if (isStubbed()) return stubResult("brave");
  return timed(async (signal) => {
    const res = await fetch(
      "https://api.search.brave.com/res/v1/web/search?q=test&count=1",
      {
        headers: { "X-Subscription-Token": env.BRAVE_SEARCH_API_KEY },
        signal,
      },
    );
    return reachableStatus("brave", res.status);
  });
}

async function checkReddit(): Promise<CheckResult> {
  if (isStubbed()) return stubResult("reddit");
  return timed(async (signal) => {
    const res = await fetch("https://www.reddit.com/r/test/about.json", {
      headers: { "User-Agent": env.REDDIT_USER_AGENT },
      signal,
    });
    return reachableStatus("reddit", res.status);
  });
}

async function checkInngest(): Promise<CheckResult> {
  if (isStubbed()) return stubResult("inngest");
  // POST a noop event. Inngest's public event-ingest endpoint accepts events
  // at https://inn.gs/e/<event-key>. A successful POST returns 200 with
  // { status: 200, ids: [...] }.
  return timed(async (signal) => {
    const res = await fetch(
      `https://inn.gs/e/${encodeURIComponent(env.INNGEST_EVENT_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "system/healthz.ping",
          data: { ts: new Date().toISOString() },
        }),
        signal,
      },
    );
    return reachableStatus("inngest", res.status);
  });
}

const checks = {
  supabase: checkSupabase,
  upstash: checkUpstash,
  groq: checkGroq,
  anthropic: checkAnthropic,
  perplexity: checkPerplexity,
  voyage: checkVoyage,
  cohere: checkCohere,
  openrouter: checkOpenRouter,
  brave: checkBrave,
  reddit: checkReddit,
  inngest: checkInngest,
} as const;

type CheckName = keyof typeof checks;

async function runOne(name: CheckName): Promise<[CheckName, CheckResult]> {
  try {
    const result = await checks[name]();
    return [name, result];
  } catch (e) {
    return [
      name,
      {
        ok: false,
        latencyMs: 0,
        error: e instanceof Error ? e.message : String(e),
      },
    ];
  }
}

export async function GET(): Promise<Response> {
  const names = Object.keys(checks) as CheckName[];
  const results = await Promise.all(names.map(runOne));
  const checksOut: Record<CheckName, CheckResult> = Object.fromEntries(results) as Record<
    CheckName,
    CheckResult
  >;
  const ok = Object.values(checksOut).every((c) => c.ok);
  return new Response(JSON.stringify({ ok, checks: checksOut }, null, 2), {
    status: ok ? 200 : 503,
    headers: { "content-type": "application/json" },
  });
}
