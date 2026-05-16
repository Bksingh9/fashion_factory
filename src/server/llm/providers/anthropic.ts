/**
 * Anthropic provider — premium tier (Claude).
 *
 * Uses the official SDK. JSON mode is faked via a forceful system instruction
 * because Claude doesn't have a native JSON-mode toggle the way OpenAI does;
 * the router validates against the zod schema and triggers a retry on parse
 * failure regardless.
 */
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/env";
import type { CompletionContext, CompletionResult } from "../types";

let cached: Anthropic | null = null;
function client(): Anthropic {
  if (cached !== null) return cached;
  cached = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return cached;
}

const JSON_NUDGE =
  "Respond with a single JSON object only. No prose, no markdown fences. The object must be valid JSON.";

export async function anthropicComplete(
  ctx: CompletionContext,
  signal?: AbortSignal,
): Promise<CompletionResult> {
  const system =
    ctx.jsonMode
      ? `${ctx.system ?? ""}\n\n${JSON_NUDGE}`.trim()
      : ctx.system;

  // Claude requires user/assistant turns; system is its own field.
  const messages = ctx.messages
    .filter((m) => m.role !== "system")
    .map((m): { role: "user" | "assistant"; content: string } => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

  const res = await client().messages.create(
    {
      model: ctx.model,
      max_tokens: 4096,
      ...(system !== undefined && system.length > 0 ? { system } : {}),
      messages,
    },
    { signal },
  );

  // Concatenate all text blocks. Tool/use and thinking blocks are ignored
  // at this layer.
  const text = res.content
    .reduce<string[]>((acc, block) => {
      if (block.type === "text") acc.push(block.text);
      return acc;
    }, [])
    .join("");

  return {
    text,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  };
}
