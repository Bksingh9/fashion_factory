/**
 * Dev.to crawler — `dev.to/api/articles`.
 *
 * Free public API, no auth required. Reads `params.tags: string[]` and
 * `params.per_page` from crawl_sources. Returns recent articles whose
 * tags match — dev complaints, opinion pieces, tool wishlists.
 *
 * Dev.to's pagination is page-based (`?page=N`); we use cursor as the
 * last-seen page number so we walk forward each tick.
 */
import { limitCrawl } from "@/server/ratelimit";
import type { Crawler, RawSignal } from "./types";
import { paramStringArray } from "./types";

interface DevtoArticle {
  id: number;
  title: string;
  description: string | null;
  body_markdown?: string;
  url: string;
  comments_count: number;
  positive_reactions_count: number;
  published_at: string;
  user: { username: string };
  tag_list?: string[];
}

const ENDPOINT = "https://dev.to/api/articles";

const devto: Crawler = async ({ cursor, params, fetcher = fetch }) => {
  const limit = await limitCrawl("devto");
  if (!limit.success) {
    throw new Error(
      `devto: rate-limited; resets at ${new Date(limit.reset).toISOString()}`,
    );
  }

  const tags = paramStringArray(params, "tags");
  const perPage = typeof params.per_page === "number" ? params.per_page : 30;
  const page = cursor !== null ? Math.max(1, Number.parseInt(cursor, 10) || 1) : 1;

  const items: RawSignal[] = [];
  // Dev.to's `tag` param accepts only one tag. Iterate.
  const tagList = tags.length === 0 ? [""] : tags;
  for (const tag of tagList) {
    const url = new URL(ENDPOINT);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    if (tag.length > 0) url.searchParams.set("tag", tag);

    const res = await fetcher(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "PainPilot/0.1 (+contact: hello@painpilot.dev)",
      },
    });
    if (!res.ok) continue;
    const body = (await res.json()) as DevtoArticle[];
    for (const a of body) {
      const text = a.description ?? a.body_markdown ?? "";
      if (text.trim().length === 0) continue;
      items.push({
        source: "devto",
        source_id: `devto-${String(a.id)}`,
        url: a.url,
        title: a.title,
        body: text.slice(0, 4000),
        author: a.user.username,
        posted_at: a.published_at,
        score: a.positive_reactions_count,
        comments_count: a.comments_count,
      });
    }
  }

  // Advance page cursor — readers can detect end-of-stream via empty items.
  return { items, nextCursor: String(page + 1) };
};

export default devto;
