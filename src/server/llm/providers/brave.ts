/**
 * Brave Search — research fallback when Perplexity is unavailable.
 *
 * Not a chat provider; returns search hits the router can hand to a
 * premium-tier completion for synthesis.
 */
import { env } from "@/env";

const ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

export interface BraveResultRow {
  title: string;
  url: string;
  snippet: string;
}

export async function braveSearch(
  query: string,
  signal?: AbortSignal,
): Promise<BraveResultRow[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("count", "10");

  const res = await fetch(url, {
    headers: { "X-Subscription-Token": env.BRAVE_SEARCH_API_KEY },
    signal,
  });
  if (!res.ok) {
    throw new Error(`brave: HTTP ${String(res.status)} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    web?: { results?: { title?: string; url?: string; description?: string }[] };
  };
  return (body.web?.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.description ?? "",
  }));
}
