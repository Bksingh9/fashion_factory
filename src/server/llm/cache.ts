/**
 * LLM response cache.
 *
 * Key = `llm:` + sha256 of the call signature (provider, model, prompt
 * version, system, messages, schema sig). TTL varies by kind, per invariants:
 *   hot 24h, premium 7d, research 12h, embed 30d, rerank 7d.
 *
 * Real backend: Upstash Redis REST. When `LLM_STUB=1`, swaps to an in-memory
 * Map so tests don't need network. The Map is process-local — no cross-test
 * leakage if tests `resetStubCache()`.
 */
import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import { z } from "zod";
import { env } from "@/env";
import type { LlmKind, LlmMessage, LlmResult } from "./types";
import { isLlmStubbed } from "./types";

const TTL_SECONDS: Record<LlmKind, number> = {
  hot: 24 * 60 * 60,
  premium: 7 * 24 * 60 * 60,
  research: 12 * 60 * 60,
  embed: 30 * 24 * 60 * 60,
  rerank: 7 * 24 * 60 * 60,
};

let redisCached: Redis | null = null;
function redis(): Redis {
  if (redisCached !== null) return redisCached;
  redisCached = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return redisCached;
}

interface MemoryEntry {
  value: unknown;
  expiresAt: number;
}
const memory = new Map<string, MemoryEntry>();

export function resetStubCache(): void {
  memory.clear();
}

export interface CacheKeyParts {
  provider: string;
  model: string;
  promptName: string | undefined;
  promptVersion: string | undefined;
  system: string | undefined;
  messages: LlmMessage[];
  schemaSig: string;
}

export function buildCacheKey(parts: CacheKeyParts): string {
  const stable = JSON.stringify({
    provider: parts.provider,
    model: parts.model,
    promptName: parts.promptName ?? null,
    promptVersion: parts.promptVersion ?? null,
    system: parts.system ?? null,
    messages: parts.messages,
    schemaSig: parts.schemaSig,
  });
  return `llm:${createHash("sha256").update(stable).digest("hex")}`;
}

export function schemaSignature(schema: z.ZodType<unknown> | undefined): string {
  if (schema === undefined) return "no-schema";
  // Use zod's JSON-schema export when available, otherwise the schema's _def.
  try {
    const json = z.toJSONSchema(schema);
    return createHash("sha256")
      .update(JSON.stringify(json))
      .digest("hex")
      .slice(0, 16);
  } catch {
    return "schema-opaque";
  }
}

export async function cacheGet(key: string): Promise<LlmResult | null> {
  if (isLlmStubbed()) {
    const hit = memory.get(key);
    if (hit === undefined) return null;
    if (hit.expiresAt < Date.now()) {
      memory.delete(key);
      return null;
    }
    return hit.value as LlmResult;
  }
  const value = await redis().get(key);
  if (value === null) return null;
  // Upstash auto-deserializes JSON. The stored shape is LlmResult sans
  // recomputed latencyMs; callers should treat `cached: true` as the source.
  return value as LlmResult;
}

export async function cacheSet(
  key: string,
  value: LlmResult,
  kind: LlmKind,
): Promise<void> {
  const ttl = TTL_SECONDS[kind];
  if (isLlmStubbed()) {
    memory.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
    return;
  }
  await redis().set(key, value, { ex: ttl });
}

/** For tests: lets you inspect what's actually in the in-memory cache. */
export function stubCacheKeys(): string[] {
  return [...memory.keys()];
}
