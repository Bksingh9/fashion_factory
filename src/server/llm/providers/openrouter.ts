/**
 * OpenRouter provider — universal fallback bus.
 *
 * The router walks here when the primary provider for a kind goes down.
 * Model slugs follow OpenRouter conventions: `meta-llama/llama-3.3-70b-instruct`,
 * `anthropic/claude-3.5-sonnet`, etc.
 */
import { env } from "@/env";
import type { CompletionContext, CompletionResult } from "../types";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export async function openrouterComplete(
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
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": env.NEXT_PUBLIC_APP_URL,
      "X-Title": "PainPilot",
    },
    body: JSON.stringify({
      model: ctx.model,
      messages,
      stream: false,
      ...(ctx.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`openrouter: HTTP ${String(res.status)} ${await res.text()}`);
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
