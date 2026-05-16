/**
 * Shared types for the LLM gateway.
 *
 * Every feature file imports from `@/server/llm/router` (not provider
 * modules), so these types are the public surface. Keep them stable.
 */
import { z } from "zod";

export type LlmKind = "hot" | "premium" | "research" | "embed" | "rerank";

export type LlmRole = "system" | "user" | "assistant";

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmCall<T = unknown> {
  kind: LlmKind;
  system?: string;
  messages: LlmMessage[];
  /** Optional zod schema for structured-output validation + auto-retry. */
  schema?: z.ZodType<T>;
  /** Name of a prompt to look up in the `prompts` table; body becomes a system message. */
  promptName?: string;
  bypassCache?: boolean;
  /** Owning user id; required for billing/tracing of authenticated calls. */
  userId?: string;
  /** Short slug — used as `purpose` in llm_traces. e.g. "extract.signals". */
  purpose: string;
  /** Hard override of the model selected from the registry. */
  modelOverride?: string;
  stream?: boolean;
}

export interface LlmResult<T = unknown> {
  /** Parsed object when `schema` was provided; raw string otherwise. */
  data: T | string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  model: string;
  provider: string;
  cached: boolean;
  /** Langfuse-side trace id; non-null even in stub mode. */
  traceId: string;
  latencyMs: number;
}

/** Provider-level capability flags read from the `models` table. */
export interface ResolvedModel {
  id: string;
  provider: string;
  model: string;
  kind: LlmKind;
  inputPer1m: number | null;
  outputPer1m: number | null;
  contextWindow: number | null;
  supportsJson: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsCaching: boolean;
}

/** Shared shape for any completion-style provider (hot/premium/research). */
export interface CompletionContext {
  model: string;
  system: string | undefined;
  messages: LlmMessage[];
  jsonMode: boolean;
  stream: boolean;
}

export interface CompletionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export type CompletionProvider = (
  ctx: CompletionContext,
  signal?: AbortSignal,
) => Promise<CompletionResult>;

export interface EmbedContext {
  input: string | string[];
  model: string;
}

export interface EmbedResult {
  embeddings: number[][];
  inputTokens: number;
}

export type EmbedProvider = (
  ctx: EmbedContext,
  signal?: AbortSignal,
) => Promise<EmbedResult>;

export interface RerankContext {
  query: string;
  documents: string[];
  topK?: number;
  model: string;
}

export interface RerankResult {
  results: { index: number; score: number }[];
}

export type RerankProvider = (
  ctx: RerankContext,
  signal?: AbortSignal,
) => Promise<RerankResult>;

/** Knob: `LLM_STUB=1` swaps every provider + cache + trace sink to in-memory fakes. */
export function isLlmStubbed(): boolean {
  return process.env.LLM_STUB === "1";
}
