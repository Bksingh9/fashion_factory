/**
 * Stub providers — used when `LLM_STUB=1`.
 *
 * Each stub:
 *   - Returns deterministic canned output so tests stay reproducible.
 *   - Logs LOUDLY to console (invariants forbid silent fakes).
 *   - Maintains a per-key counter so tests can force "fail once then succeed",
 *     bad-JSON-then-good-JSON, and downed-provider scenarios.
 *
 * Tests drive the stubs via `configureStub(...)`. Production code never
 * imports this file unless `isLlmStubbed()` is true.
 */
import type {
  CompletionContext,
  CompletionResult,
  EmbedContext,
  EmbedResult,
  RerankContext,
  RerankResult,
} from "../types";

type StubMode = "ok" | "bad-json-once" | "down" | "rate-limit-once";

interface StubConfig {
  modes: Map<string, StubMode>;
  callLog: { provider: string; model: string; mode: StubMode; calls: number }[];
}

const cfg: StubConfig = {
  modes: new Map(),
  callLog: [],
};

function loud(label: string, payload: object): void {
  console.warn(
    `[LLM-STUB] ${label} ${JSON.stringify(payload)}. LLM_STUB=1 active. NEVER ship to prod.`,
  );
}

export function configureStub(provider: string, mode: StubMode): void {
  cfg.modes.set(provider, mode);
}

export function resetStub(): void {
  cfg.modes.clear();
  cfg.callLog.length = 0;
}

export function stubCallLog(): readonly StubConfig["callLog"][number][] {
  return [...cfg.callLog];
}

function record(provider: string, model: string, mode: StubMode): void {
  const existing = cfg.callLog.find((r) => r.provider === provider && r.model === model);
  if (existing !== undefined) existing.calls += 1;
  else cfg.callLog.push({ provider, model, mode, calls: 1 });
}

function modeFor(provider: string): StubMode {
  return cfg.modes.get(provider) ?? "ok";
}

/** Counter so "*-once" modes flip on second call within the same key. */
const onceCounters = new Map<string, number>();
function bumpOnce(key: string): number {
  const n = (onceCounters.get(key) ?? 0) + 1;
  onceCounters.set(key, n);
  return n;
}

export function makeStubCompletion(provider: string): (
  ctx: CompletionContext,
) => Promise<CompletionResult> {
  return async (ctx: CompletionContext): Promise<CompletionResult> => {
    const mode = modeFor(provider);
    record(provider, ctx.model, mode);
    loud("complete", { provider, model: ctx.model, mode, jsonMode: ctx.jsonMode });

    if (mode === "down") {
      throw new Error(`[STUB] provider "${provider}" is configured DOWN`);
    }
    if (mode === "rate-limit-once") {
      const n = bumpOnce(`${provider}:rate-limit-once`);
      if (n === 1) {
        const e = new Error(`[STUB] 429 rate limit (once) from ${provider}`);
        // Encode HTTP status so the router's retry logic kicks in.
        (e as Error & { status?: number }).status = 429;
        throw e;
      }
    }
    if (mode === "bad-json-once" && ctx.jsonMode) {
      const n = bumpOnce(`${provider}:bad-json-once`);
      if (n === 1) {
        return {
          text: "this is definitely not valid json {[",
          inputTokens: 12,
          outputTokens: 8,
        };
      }
    }

    const text = ctx.jsonMode
      ? JSON.stringify({
          stub: true,
          provider,
          model: ctx.model,
          echo: ctx.messages.at(-1)?.content ?? "",
        })
      : `[STUB:${provider}/${ctx.model}] ${ctx.messages.at(-1)?.content ?? ""}`;

    return { text, inputTokens: 25, outputTokens: 40 };
  };
}

export function makeStubEmbed(provider: string): (
  ctx: EmbedContext,
) => Promise<EmbedResult> {
  return async (ctx: EmbedContext): Promise<EmbedResult> => {
    const mode = modeFor(provider);
    record(provider, ctx.model, mode);
    loud("embed", { provider, model: ctx.model, mode });
    if (mode === "down") {
      throw new Error(`[STUB] embed provider "${provider}" is configured DOWN`);
    }
    const inputs = Array.isArray(ctx.input) ? ctx.input : [ctx.input];
    // Deterministic 8-dim vector per input string: tiny hash bucket → float.
    const embeddings = inputs.map((s) => {
      const out: number[] = [];
      for (let i = 0; i < 8; i++) {
        let h = 0;
        for (let j = i; j < s.length; j += 8) {
          h = (h * 31 + s.charCodeAt(j)) | 0;
        }
        out.push(((h % 1000) - 500) / 1000);
      }
      return out;
    });
    return { embeddings, inputTokens: inputs.reduce((a, s) => a + s.length, 0) };
  };
}

export function makeStubRerank(provider: string): (
  ctx: RerankContext,
) => Promise<RerankResult> {
  return async (ctx: RerankContext): Promise<RerankResult> => {
    const mode = modeFor(provider);
    record(provider, ctx.model, mode);
    loud("rerank", { provider, model: ctx.model, mode });
    if (mode === "down") {
      throw new Error(`[STUB] rerank provider "${provider}" is configured DOWN`);
    }
    // Deterministic score: 1 / (1 + index) — preserves input order with
    // monotonically-decreasing scores, which is "reasonable enough" for tests.
    const results = ctx.documents.map((_doc, index) => ({
      index,
      score: 1 / (1 + index),
    }));
    results.sort((a, b) => b.score - a.score);
    const topK = ctx.topK ?? results.length;
    return { results: results.slice(0, topK) };
  };
}
