/**
 * Models registry — reads active rows from the `models` table.
 *
 * In-memory cache for 60s per kind. Toggling `active` in the DB takes effect
 * within that window (or instantly if Realtime invalidation is wired — see
 * subscribeModelsRealtime() at the bottom of this file).
 *
 * `LLM_STUB=1` skips Supabase entirely and serves a hard-coded fixture
 * matching the migration seeds, so tests don't need a live DB.
 */
import { supabaseService } from "@/server/db/service";
import type { LlmKind, ResolvedModel } from "./types";
import { isLlmStubbed } from "./types";

interface CacheEntry {
  value: ResolvedModel;
  expiresAt: number;
}

const TTL_MS = 60_000;
const cache = new Map<LlmKind, CacheEntry>();

/** Seed fixture mirrors 0002_llm_registry.sql exactly. */
const STUB_REGISTRY: Record<LlmKind, ResolvedModel> = {
  hot: {
    id: "stub-hot",
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    kind: "hot",
    inputPer1m: 0.59,
    outputPer1m: 0.79,
    contextWindow: 131072,
    supportsJson: true,
    supportsTools: true,
    supportsVision: false,
    supportsCaching: false,
  },
  premium: {
    id: "stub-premium",
    provider: "anthropic",
    model: "claude-3-5-sonnet-latest",
    kind: "premium",
    inputPer1m: 3,
    outputPer1m: 15,
    contextWindow: 200000,
    supportsJson: true,
    supportsTools: true,
    supportsVision: true,
    supportsCaching: true,
  },
  research: {
    id: "stub-research",
    provider: "perplexity",
    model: "sonar",
    kind: "research",
    inputPer1m: 1,
    outputPer1m: 1,
    contextWindow: 127000,
    supportsJson: false,
    supportsTools: false,
    supportsVision: false,
    supportsCaching: false,
  },
  embed: {
    id: "stub-embed",
    provider: "voyage",
    model: "voyage-3-large",
    kind: "embed",
    inputPer1m: 0.18,
    outputPer1m: 0,
    contextWindow: 32000,
    supportsJson: false,
    supportsTools: false,
    supportsVision: false,
    supportsCaching: false,
  },
  rerank: {
    id: "stub-rerank",
    provider: "cohere",
    model: "rerank-3",
    kind: "rerank",
    inputPer1m: 1000,
    outputPer1m: 0,
    contextWindow: 4096,
    supportsJson: false,
    supportsTools: false,
    supportsVision: false,
    supportsCaching: false,
  },
};

const stubOverrides = new Map<LlmKind, ResolvedModel>();

/** Tests can swap the active model for a kind without touching the DB. */
export function setStubActiveModel(kind: LlmKind, model: ResolvedModel): void {
  stubOverrides.set(kind, model);
}

export function resetStubRegistry(): void {
  stubOverrides.clear();
  cache.clear();
}

export async function resolveActiveModel(kind: LlmKind): Promise<ResolvedModel> {
  if (isLlmStubbed()) {
    return stubOverrides.get(kind) ?? STUB_REGISTRY[kind];
  }

  const hit = cache.get(kind);
  if (hit !== undefined && hit.expiresAt > Date.now()) {
    return hit.value;
  }

  const sb = supabaseService();
  const { data, error } = await sb
    .from("models")
    .select(
      "id, provider, model, kind, input_per_1m, output_per_1m, context_window, supports_json, supports_tools, supports_vision, supports_caching",
    )
    .eq("kind", kind)
    .eq("active", true)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`registry: failed to load active ${kind} model: ${error.message}`);
  }
  if (data === null) {
    throw new Error(`registry: no active row for kind=${kind}`);
  }

  const resolved: ResolvedModel = {
    id: data.id,
    provider: data.provider,
    model: data.model,
    kind: data.kind,
    inputPer1m: data.input_per_1m,
    outputPer1m: data.output_per_1m,
    contextWindow: data.context_window,
    supportsJson: data.supports_json,
    supportsTools: data.supports_tools,
    supportsVision: data.supports_vision,
    supportsCaching: data.supports_caching,
  };

  cache.set(kind, { value: resolved, expiresAt: Date.now() + TTL_MS });
  return resolved;
}

/**
 * Supabase Realtime invalidation hook. Wire from a long-lived server context
 * (e.g. Inngest worker boot, or a singleton on the Next server). No-op in
 * stub mode.
 */
export function subscribeModelsRealtime(): () => void {
  if (isLlmStubbed()) return (): void => {};
  const sb = supabaseService();
  const ch = sb
    .channel("models_changed")
    .on("postgres_changes", { event: "*", schema: "public", table: "models" }, () => {
      cache.clear();
    })
    .subscribe();
  return (): void => {
    void sb.removeChannel(ch);
  };
}
