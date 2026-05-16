/**
 * Cohere provider — Rerank 3 for retrieval re-ranking.
 */
import { env } from "@/env";
import type { RerankContext, RerankResult } from "../types";

const ENDPOINT = "https://api.cohere.com/v1/rerank";

export async function cohereRerank(
  ctx: RerankContext,
  signal?: AbortSignal,
): Promise<RerankResult> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.COHERE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ctx.model,
      query: ctx.query,
      documents: ctx.documents,
      top_n: ctx.topK ?? ctx.documents.length,
    }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`cohere rerank: HTTP ${String(res.status)} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    results?: { index: number; relevance_score: number }[];
  };
  return {
    results: (body.results ?? []).map((r) => ({
      index: r.index,
      score: r.relevance_score,
    })),
  };
}
