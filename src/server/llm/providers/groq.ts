/**
 * Groq provider — hot tier (Llama 3.x). OpenAI-compatible chat-completions API.
 */
import Groq from "groq-sdk";
import { env } from "@/env";
import type {
  CompletionContext,
  CompletionResult,
  EmbedContext,
  EmbedResult,
} from "../types";

let cached: Groq | null = null;
function client(): Groq {
  if (cached !== null) return cached;
  cached = new Groq({ apiKey: env.GROQ_API_KEY });
  return cached;
}

export async function groqComplete(
  ctx: CompletionContext,
  signal?: AbortSignal,
): Promise<CompletionResult> {
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [];
  if (ctx.system !== undefined) messages.push({ role: "system", content: ctx.system });
  for (const m of ctx.messages) messages.push({ role: m.role, content: m.content });

  const res = await client().chat.completions.create(
    {
      model: ctx.model,
      messages,
      ...(ctx.jsonMode ? { response_format: { type: "json_object" } } : {}),
      stream: false,
    },
    { signal },
  );

  const choice = res.choices[0];
  const text = choice?.message?.content ?? "";
  const usage = res.usage;
  return {
    text,
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
  };
}

/**
 * Groq doesn't currently expose a managed embeddings endpoint; we use the
 * BGE-via-Groq path advertised in the invariants by calling the OpenAI-shape
 * embeddings route. If/when Groq adds a first-class embeddings API, swap here.
 */
export async function groqEmbed(
  ctx: EmbedContext,
  signal?: AbortSignal,
): Promise<EmbedResult> {
  const inputs = Array.isArray(ctx.input) ? ctx.input : [ctx.input];
  const res = await fetch("https://api.groq.com/openai/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: ctx.model, input: inputs }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`groq embed: HTTP ${String(res.status)} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    data?: { embedding: number[] }[];
    usage?: { prompt_tokens?: number };
  };
  const embeddings = (body.data ?? []).map((d) => d.embedding);
  return { embeddings, inputTokens: body.usage?.prompt_tokens ?? 0 };
}
