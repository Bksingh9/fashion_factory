/**
 * LLM router — single entry point for every model call in PainPilot.
 *
 * Pipeline per text-completion call:
 *   1. Resolve active model from `models` registry (or modelOverride).
 *   2. If `promptName`, fetch active prompt body; prepend as system.
 *   3. If `schema`, emit a JSON-only nudge + use provider JSON mode where supported.
 *   4. Check cache unless `bypassCache`.
 *   5. Call provider; retry 2× on 429/5xx with 500ms / 2s backoff.
 *   6. On hard fail, walk the kind-specific fallback chain.
 *   7. On schema parse failure, retry once with a "previous reply was invalid JSON" nudge.
 *   8. Write llm_traces row + emit Langfuse trace; return result.
 *
 * Embed / rerank use their own simpler paths (no schema, no fallback nudge),
 * exposed through the same `llm.embed` / `llm.rerank` surface.
 *
 * `LLM_STUB=1` swaps every provider, the cache, and the trace sink for
 * deterministic in-memory fakes. Trace rows skip the DB and land in a
 * process-local array tests can inspect via `stubTraceLog()`.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { supabaseService } from "@/server/db/service";
import { groqComplete, groqEmbed } from "./providers/groq";
import { anthropicComplete } from "./providers/anthropic";
import { perplexityComplete } from "./providers/perplexity";
import { openrouterComplete } from "./providers/openrouter";
import { voyageEmbed } from "./providers/voyage";
import { cohereRerank } from "./providers/cohere";
import {
  makeStubCompletion,
  makeStubEmbed,
  makeStubRerank,
} from "./providers/stub";
import {
  buildCacheKey,
  cacheGet,
  cacheSet,
  schemaSignature,
} from "./cache";
import { computeCost } from "./pricing";
import { getPrompt } from "./prompts";
import { resolveActiveModel } from "./registry";
import { startTrace } from "./traced";
import type {
  CompletionContext,
  CompletionProvider,
  CompletionResult,
  EmbedProvider,
  EmbedResult,
  LlmCall,
  LlmKind,
  LlmMessage,
  LlmResult,
  RerankContext,
  RerankProvider,
  RerankResult,
  ResolvedModel,
} from "./types";
import { isLlmStubbed } from "./types";

const JSON_NUDGE_SYSTEM =
  "Output a single JSON object that matches the requested shape. No markdown, no prose, no code fences.";

const RETRY_DELAYS_MS = [500, 2000] as const;

// ---------- Provider routing ----------

interface CompletionRoute {
  provider: string;
  model: string;
  call: CompletionProvider;
}

interface EmbedRoute {
  provider: string;
  model: string;
  call: EmbedProvider;
}

interface RerankRoute {
  provider: string;
  model: string;
  call: RerankProvider;
}

function realCompletionFor(provider: string, model: string): CompletionRoute {
  if (isLlmStubbed()) {
    return { provider, model, call: makeStubCompletion(provider) };
  }
  switch (provider) {
    case "groq":
      return { provider, model, call: groqComplete };
    case "anthropic":
      return { provider, model, call: anthropicComplete };
    case "perplexity":
      return { provider, model, call: perplexityComplete };
    case "openrouter":
      return { provider, model, call: openrouterComplete };
    default:
      throw new Error(`router: no completion provider for "${provider}"`);
  }
}

function realEmbedFor(provider: string, model: string): EmbedRoute {
  if (isLlmStubbed()) {
    return { provider, model, call: makeStubEmbed(provider) };
  }
  switch (provider) {
    case "voyage":
      return { provider, model, call: voyageEmbed };
    case "groq":
      // BGE-via-Groq fallback path (OpenAI-shape embeddings).
      return { provider, model, call: groqEmbed };
    default:
      throw new Error(`router: no embed provider for "${provider}"`);
  }
}

function realRerankFor(provider: string, model: string): RerankRoute {
  if (isLlmStubbed()) {
    return { provider, model, call: makeStubRerank(provider) };
  }
  switch (provider) {
    case "cohere":
      return { provider, model, call: cohereRerank };
    default:
      throw new Error(`router: no rerank provider for "${provider}"`);
  }
}

function fallbackChain(kind: LlmKind, primary: ResolvedModel): CompletionRoute[] {
  // Each entry is fully resolved (provider+model+impl) so the caller doesn't
  // re-touch the registry for fallbacks. Order matches invariants §2.
  const out: CompletionRoute[] = [
    realCompletionFor(primary.provider, primary.model),
  ];
  switch (kind) {
    case "hot":
      out.push(realCompletionFor("openrouter", "meta-llama/llama-3.3-70b-instruct"));
      out.push(realCompletionFor("anthropic", "claude-3-5-haiku-latest"));
      break;
    case "premium":
      out.push(realCompletionFor("openrouter", "anthropic/claude-3.5-sonnet"));
      out.push(realCompletionFor("anthropic", "claude-3-5-haiku-latest"));
      break;
    case "research":
      out.push(realCompletionFor("openrouter", "perplexity/llama-3.1-sonar-large-128k-online"));
      break;
    case "embed":
    case "rerank":
      // Handled separately by callEmbed / callRerank.
      break;
  }
  return out;
}

function fallbackEmbedChain(primary: ResolvedModel): EmbedRoute[] {
  return [
    realEmbedFor(primary.provider, primary.model),
    realEmbedFor("groq", "bge-large-en-v1.5"),
  ];
}

function fallbackRerankChain(primary: ResolvedModel): RerankRoute[] {
  return [realRerankFor(primary.provider, primary.model)];
}

// ---------- Retry helper ----------

interface ErrorWithStatus extends Error {
  status?: number;
}

function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const s = (err as ErrorWithStatus).status;
  if (s !== undefined && (s === 429 || s >= 500)) return true;
  // Heuristic: SDK errors that mention status codes in the message.
  return /\b(429|5\d\d)\b/.test(err.message);
}

async function callWithRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const ctrl = new AbortController();
      // Per-attempt timeout. Generous because LLM calls are slow.
      const timer = setTimeout(() => ctrl.abort(), 60_000);
      try {
        return await fn(ctrl.signal);
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      lastErr = e;
      if (!isRetryable(e)) throw e;
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) break;
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// ---------- Trace sink ----------

interface TraceRow {
  userId: string | null;
  purpose: string;
  provider: string;
  model: string;
  promptName: string | null;
  promptVersion: string | null;
  promptHash: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  cacheHit: boolean;
  traceId: string;
}

const stubTraces: TraceRow[] = [];

export function stubTraceLog(): readonly TraceRow[] {
  return [...stubTraces];
}

export function resetStubTraces(): void {
  stubTraces.length = 0;
}

async function recordTrace(row: TraceRow): Promise<void> {
  if (isLlmStubbed()) {
    stubTraces.push(row);
    return;
  }
  const sb = supabaseService();
  const { error } = await sb.from("llm_traces").insert({
    user_id: row.userId,
    purpose: row.purpose,
    provider: row.provider,
    model: row.model,
    prompt_name: row.promptName,
    prompt_version: row.promptVersion,
    prompt_hash: row.promptHash,
    input_tokens: row.inputTokens,
    output_tokens: row.outputTokens,
    cost_usd: row.costUsd,
    latency_ms: row.latencyMs,
    cache_hit: row.cacheHit,
    trace_id: row.traceId,
  });
  if (error !== null) {
    // Loud-fail per "never silently fail". Don't throw — tracing failures
    // shouldn't block successful LLM calls.
    console.error(
      `[llm.router] failed to record trace: ${error.message} (${JSON.stringify(row)})`,
    );
  }
}

// ---------- Schema validation + retry ----------

function tryParseSchema<T>(
  schema: z.ZodType<T>,
  text: string,
): { ok: true; data: T } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(text) as unknown;
    const r = schema.safeParse(parsed);
    if (r.success) return { ok: true, data: r.data };
    return { ok: false, error: r.error.message };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ---------- Completion path ----------

async function callCompletion<T>(call: LlmCall<T>): Promise<LlmResult<T>> {
  const startedAt = Date.now();
  const primary = await resolveActiveModel(call.kind);

  // Prompt body, if requested.
  let promptName: string | null = null;
  let promptVersion: string | null = null;
  let promptHash: string | null = null;
  const systemBits: string[] = [];
  if (call.system !== undefined) systemBits.push(call.system);
  if (call.promptName !== undefined) {
    const p = await getPrompt(call.promptName);
    promptName = p.name;
    promptVersion = p.version;
    promptHash = createHash("sha256").update(p.body).digest("hex").slice(0, 16);
    systemBits.push(p.body);
  }
  if (call.schema !== undefined) systemBits.push(JSON_NUDGE_SYSTEM);
  const system = systemBits.length > 0 ? systemBits.join("\n\n") : undefined;

  const trace = startTrace({
    name: call.purpose,
    userId: call.userId,
    metadata: { kind: call.kind, promptName, promptVersion },
  });

  // Resolve the active route (and fallback list).
  const routes = call.modelOverride !== undefined
    ? [realCompletionFor(primary.provider, call.modelOverride)]
    : fallbackChain(call.kind, primary);

  // Cache lookup uses the primary route's identity (otherwise cached results
  // for the primary would be missed once a fallback succeeds).
  const cacheKey = buildCacheKey({
    provider: primary.provider,
    model: call.modelOverride ?? primary.model,
    promptName: promptName ?? undefined,
    promptVersion: promptVersion ?? undefined,
    system,
    messages: call.messages,
    schemaSig: schemaSignature(call.schema),
  });

  if (call.bypassCache !== true) {
    const hit = await cacheGet(cacheKey);
    if (hit !== null) {
      trace.end({ tokensIn: hit.tokensIn, tokensOut: hit.tokensOut });
      await recordTrace({
        userId: call.userId ?? null,
        purpose: call.purpose,
        provider: hit.provider,
        model: hit.model,
        promptName,
        promptVersion,
        promptHash,
        inputTokens: hit.tokensIn,
        outputTokens: hit.tokensOut,
        costUsd: hit.costUsd,
        latencyMs: Date.now() - startedAt,
        cacheHit: true,
        traceId: hit.traceId,
      });
      // Re-validate against the schema if one was provided (schema may have
      // changed since the cache entry was written; in practice they
      // shouldn't, because the schema-sig is part of the key).
      if (call.schema !== undefined && typeof hit.data === "string") {
        const parsed = tryParseSchema(call.schema, hit.data);
        if (parsed.ok) {
          return { ...hit, data: parsed.data, cached: true } as LlmResult<T>;
        }
      }
      return { ...hit, cached: true } as LlmResult<T>;
    }
  }

  // Try each route in the fallback chain.
  let last: { route: CompletionRoute; result: CompletionResult } | null = null;
  let fatal: unknown = null;
  for (const route of routes) {
    const ctx: CompletionContext = {
      model: route.model,
      system,
      messages: call.messages,
      jsonMode: call.schema !== undefined && primary.supportsJson,
      stream: call.stream ?? false,
    };
    try {
      const result = await callWithRetry((signal) => route.call(ctx, signal));
      last = { route, result };
      break;
    } catch (e) {
      fatal = e;
      // Walk the fallback chain. The router invariants say walk on HARD fail;
      // we treat both retry-exhausted retryable and non-retryable as hard.
      continue;
    }
  }
  if (last === null) {
    trace.end({ error: fatal instanceof Error ? fatal.message : String(fatal) });
    throw fatal instanceof Error ? fatal : new Error(String(fatal));
  }

  // Schema validation + one retry on parse failure.
  let resultText = last.result.text;
  let chosenRoute = last.route;
  let resultTokens = last.result;

  if (call.schema !== undefined) {
    const parsed = tryParseSchema(call.schema, resultText);
    if (!parsed.ok) {
      // Single retry with explicit feedback. Walk the same chain again so we
      // get the same provider order as the primary attempt.
      const nudged: LlmMessage[] = [
        ...call.messages,
        {
          role: "assistant",
          content: resultText,
        },
        {
          role: "user",
          content: `Your previous reply was invalid JSON (parser said: ${parsed.error}). Respond again with a single valid JSON object only.`,
        },
      ];
      for (const route of routes) {
        const ctx: CompletionContext = {
          model: route.model,
          system,
          messages: nudged,
          jsonMode: primary.supportsJson,
          stream: false,
        };
        try {
          const result = await callWithRetry((signal) => route.call(ctx, signal));
          resultText = result.text;
          chosenRoute = route;
          // Combine tokens — counts both the first call and the retry against
          // the user's quota.
          resultTokens = {
            text: result.text,
            inputTokens: resultTokens.inputTokens + result.inputTokens,
            outputTokens: resultTokens.outputTokens + result.outputTokens,
          };
          break;
        } catch {
          // try next fallback
        }
      }
    }
  }

  const costUsd = computeCost(
    { inputPer1m: primary.inputPer1m, outputPer1m: primary.outputPer1m },
    resultTokens.inputTokens,
    resultTokens.outputTokens,
  );

  let data: T | string = resultText;
  if (call.schema !== undefined) {
    const parsed = tryParseSchema(call.schema, resultText);
    if (parsed.ok) data = parsed.data;
    else {
      // Even after retry: surface the raw string. Caller can decide what to
      // do; the trace records the bad call.
      data = resultText;
    }
  }

  const out: LlmResult<T> = {
    data,
    tokensIn: resultTokens.inputTokens,
    tokensOut: resultTokens.outputTokens,
    costUsd,
    model: chosenRoute.model,
    provider: chosenRoute.provider,
    cached: false,
    traceId: trace.traceId,
    latencyMs: Date.now() - startedAt,
  };

  trace.end({ tokensIn: out.tokensIn, tokensOut: out.tokensOut });
  await recordTrace({
    userId: call.userId ?? null,
    purpose: call.purpose,
    provider: out.provider,
    model: out.model,
    promptName,
    promptVersion,
    promptHash,
    inputTokens: out.tokensIn,
    outputTokens: out.tokensOut,
    costUsd: out.costUsd,
    latencyMs: out.latencyMs,
    cacheHit: false,
    traceId: out.traceId,
  });

  if (call.bypassCache !== true) {
    await cacheSet(cacheKey, out, call.kind);
  }

  return out;
}

// ---------- Embed path ----------

interface EmbedCall {
  input: string | string[];
  purpose: string;
  userId?: string;
  bypassCache?: boolean;
}

async function callEmbed(call: EmbedCall): Promise<{
  embeddings: number[][];
  inputTokens: number;
  costUsd: number;
  model: string;
  provider: string;
  cached: boolean;
  traceId: string;
  latencyMs: number;
}> {
  const startedAt = Date.now();
  const primary = await resolveActiveModel("embed");
  const trace = startTrace({ name: call.purpose, userId: call.userId });

  // Embed cache key — we don't reuse buildCacheKey (different shape).
  const inputs = Array.isArray(call.input) ? call.input : [call.input];
  const stable = JSON.stringify({ provider: primary.provider, model: primary.model, inputs });
  const cacheKey = `llm:embed:${createHash("sha256").update(stable).digest("hex")}`;

  if (call.bypassCache !== true) {
    const hit = await cacheGet(cacheKey);
    if (hit !== null) {
      trace.end({ tokensIn: hit.tokensIn, tokensOut: 0 });
      return {
        embeddings: (hit.data as { embeddings: number[][] }).embeddings,
        inputTokens: hit.tokensIn,
        costUsd: hit.costUsd,
        model: hit.model,
        provider: hit.provider,
        cached: true,
        traceId: hit.traceId,
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  const routes = fallbackEmbedChain(primary);
  let last: { route: EmbedRoute; result: EmbedResult } | null = null;
  let fatal: unknown = null;
  for (const route of routes) {
    try {
      const result = await callWithRetry((signal) =>
        route.call({ input: inputs, model: route.model }, signal),
      );
      last = { route, result };
      break;
    } catch (e) {
      fatal = e;
    }
  }
  if (last === null) {
    trace.end({ error: fatal instanceof Error ? fatal.message : String(fatal) });
    throw fatal instanceof Error ? fatal : new Error(String(fatal));
  }

  const costUsd = computeCost(
    { inputPer1m: primary.inputPer1m, outputPer1m: 0 },
    last.result.inputTokens,
    0,
  );
  const out: LlmResult = {
    data: { embeddings: last.result.embeddings },
    tokensIn: last.result.inputTokens,
    tokensOut: 0,
    costUsd,
    model: last.route.model,
    provider: last.route.provider,
    cached: false,
    traceId: trace.traceId,
    latencyMs: Date.now() - startedAt,
  };

  await cacheSet(cacheKey, out, "embed");
  trace.end({ tokensIn: out.tokensIn, tokensOut: 0 });
  await recordTrace({
    userId: call.userId ?? null,
    purpose: call.purpose,
    provider: out.provider,
    model: out.model,
    promptName: null,
    promptVersion: null,
    promptHash: null,
    inputTokens: out.tokensIn,
    outputTokens: 0,
    costUsd,
    latencyMs: out.latencyMs,
    cacheHit: false,
    traceId: out.traceId,
  });

  return {
    embeddings: last.result.embeddings,
    inputTokens: out.tokensIn,
    costUsd,
    model: out.model,
    provider: out.provider,
    cached: false,
    traceId: out.traceId,
    latencyMs: out.latencyMs,
  };
}

// ---------- Rerank path ----------

interface RerankCall {
  query: string;
  documents: string[];
  topK?: number;
  purpose: string;
  userId?: string;
}

async function callRerank(call: RerankCall): Promise<RerankResult & {
  model: string;
  provider: string;
  traceId: string;
  latencyMs: number;
}> {
  const startedAt = Date.now();
  const primary = await resolveActiveModel("rerank");
  const trace = startTrace({ name: call.purpose, userId: call.userId });

  const routes = fallbackRerankChain(primary);
  let last: { route: RerankRoute; result: RerankResult } | null = null;
  let fatal: unknown = null;
  for (const route of routes) {
    try {
      const ctx: RerankContext = {
        query: call.query,
        documents: call.documents,
        topK: call.topK,
        model: route.model,
      };
      const result = await callWithRetry((signal) => route.call(ctx, signal));
      last = { route, result };
      break;
    } catch (e) {
      fatal = e;
    }
  }
  if (last === null) {
    trace.end({ error: fatal instanceof Error ? fatal.message : String(fatal) });
    throw fatal instanceof Error ? fatal : new Error(String(fatal));
  }

  trace.end({});
  await recordTrace({
    userId: call.userId ?? null,
    purpose: call.purpose,
    provider: last.route.provider,
    model: last.route.model,
    promptName: null,
    promptVersion: null,
    promptHash: null,
    inputTokens: call.documents.length,
    outputTokens: 0,
    costUsd: 0,
    latencyMs: Date.now() - startedAt,
    cacheHit: false,
    traceId: trace.traceId,
  });

  return {
    results: last.result.results,
    model: last.route.model,
    provider: last.route.provider,
    traceId: trace.traceId,
    latencyMs: Date.now() - startedAt,
  };
}

// ---------- Public surface ----------

export const llm = {
  hot<T = string>(call: Omit<LlmCall<T>, "kind">): Promise<LlmResult<T>> {
    return callCompletion<T>({ ...call, kind: "hot" });
  },
  premium<T = string>(call: Omit<LlmCall<T>, "kind">): Promise<LlmResult<T>> {
    return callCompletion<T>({ ...call, kind: "premium" });
  },
  research<T = string>(call: Omit<LlmCall<T>, "kind">): Promise<LlmResult<T>> {
    return callCompletion<T>({ ...call, kind: "research" });
  },
  embed: callEmbed,
  rerank: callRerank,
};

export type Llm = typeof llm;
