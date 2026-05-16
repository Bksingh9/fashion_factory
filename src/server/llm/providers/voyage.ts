/**
 * Voyage AI provider — primary embeddings.
 */
import { env } from "@/env";
import type { EmbedContext, EmbedResult } from "../types";

const ENDPOINT = "https://api.voyageai.com/v1/embeddings";

export async function voyageEmbed(
  ctx: EmbedContext,
  signal?: AbortSignal,
): Promise<EmbedResult> {
  const inputs = Array.isArray(ctx.input) ? ctx.input : [ctx.input];

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: ctx.model, input: inputs }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`voyage: HTTP ${String(res.status)} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    data?: { embedding: number[] }[];
    usage?: { total_tokens?: number };
  };
  return {
    embeddings: (body.data ?? []).map((d) => d.embedding),
    inputTokens: body.usage?.total_tokens ?? 0,
  };
}
