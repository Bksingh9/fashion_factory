/**
 * Prompts registry — reads the active version of a prompt from the `prompts`
 * table. Same 60s in-memory cache + realtime invalidation pattern as
 * registry.ts. `LLM_STUB=1` serves the placeholder seeds in-process.
 */
import { supabaseService } from "@/server/db/service";
import { isLlmStubbed } from "./types";

export interface ResolvedPrompt {
  name: string;
  version: string;
  body: string;
  schemaJson: unknown;
}

interface CacheEntry {
  value: ResolvedPrompt;
  expiresAt: number;
}

const TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

const STUB_SEED_NAMES = [
  "extract.signals",
  "cluster.summarize",
  "validate.audience",
  "validate.competitors",
  "spec.generate",
  "launch.product_hunt",
  "launch.x_thread",
  "launch.reddit_replies",
  "launch.cold_email",
  "launch.landing_page",
  "test.prompt",
];

const stubOverrides = new Map<string, ResolvedPrompt>();

export function setStubPrompt(name: string, prompt: ResolvedPrompt): void {
  stubOverrides.set(name, prompt);
}

export function resetStubPrompts(): void {
  stubOverrides.clear();
  cache.clear();
}

export async function getPrompt(name: string): Promise<ResolvedPrompt> {
  if (isLlmStubbed()) {
    const override = stubOverrides.get(name);
    if (override !== undefined) return override;
    if (STUB_SEED_NAMES.includes(name)) {
      return {
        name,
        version: "v1",
        body: "TBD, see Phase 2+",
        schemaJson: null,
      };
    }
    throw new Error(`prompts: no stub for "${name}" (set with setStubPrompt)`);
  }

  const hit = cache.get(name);
  if (hit !== undefined && hit.expiresAt > Date.now()) {
    return hit.value;
  }

  const sb = supabaseService();
  const { data, error } = await sb
    .from("prompts")
    .select("name, version, body, schema_json")
    .eq("name", name)
    .eq("active", true)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`prompts: failed to load "${name}": ${error.message}`);
  }
  if (data === null) {
    throw new Error(`prompts: no active version for "${name}"`);
  }

  const resolved: ResolvedPrompt = {
    name: data.name,
    version: data.version,
    body: data.body,
    schemaJson: data.schema_json,
  };
  cache.set(name, { value: resolved, expiresAt: Date.now() + TTL_MS });
  return resolved;
}

export function subscribePromptsRealtime(): () => void {
  if (isLlmStubbed()) return (): void => {};
  const sb = supabaseService();
  const ch = sb
    .channel("prompts_changed")
    .on("postgres_changes", { event: "*", schema: "public", table: "prompts" }, () => {
      cache.clear();
    })
    .subscribe();
  return (): void => {
    void sb.removeChannel(ch);
  };
}
