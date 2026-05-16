/**
 * Perplexity provider — research tier (Sonar). OpenAI-compatible chat API.
 */
import { env } from "@/env";
import type { CompletionContext, CompletionResult } from "../types";

const ENDPOINT = "https://api.perplexity.ai/chat/completions";

export async function perplexityComplete(
  ctx: CompletionContext,
  signal?: AbortSignal,
): Promise<CompletionResult> {
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [];
  if (ctx.system !== undefined && ctx.system.length > 0) {
    messages.push({ role: "system", content: ctx.system });
  }
  for (const m of ctx.messages) messages.push({ role: m.role, content: m.content });

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ctx.model,
      messages,
      stream: false,
    }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`perplexity: HTTP ${String(res.status)} ${await res.text()}`);
  }

  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = body.choices?.[0]?.message?.content ?? "";
  return {
    text,
    inputTokens: body.usage?.prompt_tokens ?? 0,
    outputTokens: body.usage?.completion_tokens ?? 0,
  };
}
