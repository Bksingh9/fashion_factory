/**
 * Reddit crawler — OAuth-authenticated GETs against `oauth.reddit.com`.
 *
 * Reads `params.subreddits: string[]` from the crawl_sources row. Returns
 * a `RawSignal` per self-post (text post; link-posts skipped because they
 * don't carry the complaint body). Dedup is by (`source`, `source_id`) at
 * the persist layer — this module just emits everything it sees.
 *
 * The cursor is Reddit's `after` token from the most recent page. We poll
 * `/r/{sub}/new.json` (newest-first), so on each tick we walk back until
 * we hit the previous cursor. For the first run, cursor is null → we take
 * the first page only.
 */
import { env } from "@/env";
import { limitCrawl } from "@/server/ratelimit";
import { getRedditAccessToken } from "@/server/auth/reddit_oauth";
import type { Crawler, RawSignal } from "./types";
import { paramStringArray } from "./types";

interface RedditChildData {
  id: string;
  title: string;
  selftext: string;
  author: string;
  permalink: string;
  created_utc: number;
  score: number;
  num_comments: number;
}
interface RedditChild {
  kind: string;
  data: RedditChildData;
}
interface RedditListing {
  data: {
    after: string | null;
    children: RedditChild[];
  };
}

const reddit: Crawler = async ({ cursor, params, fetcher = fetch }) => {
  const limit = await limitCrawl("reddit");
  if (!limit.success) {
    throw new Error(
      `reddit: rate-limited; resets at ${new Date(limit.reset).toISOString()}`,
    );
  }

  const subs = paramStringArray(params, "subreddits");
  if (subs.length === 0) return { items: [], nextCursor: null };

  // OAuth gives higher rate ceilings but isn't required — reddit.com's
  // public JSON endpoint works anonymously with just a descriptive UA.
  const token = await getRedditAccessToken(fetcher);
  const items: RawSignal[] = [];
  let nextCursor: string | null = null;

  for (const sub of subs) {
    // OAuth path → oauth.reddit.com; anonymous path → www.reddit.com
    const host = token === null ? "https://www.reddit.com" : "https://oauth.reddit.com";
    const url = new URL(`${host}/r/${sub}/new.json`);
    url.searchParams.set("limit", "25");
    if (cursor !== null) url.searchParams.set("after", cursor);

    const headers: Record<string, string> = {
      "User-Agent": env.REDDIT_USER_AGENT,
    };
    if (token !== null) headers.Authorization = `Bearer ${token}`;

    const res = await fetcher(url.toString(), { headers });
    if (!res.ok) {
      throw new Error(`reddit: HTTP ${String(res.status)} for /r/${sub}`);
    }
    const body = (await res.json()) as RedditListing;
    for (const child of body.data.children) {
      const d = child.data;
      // Skip linkposts and empty selftexts — they don't contain the complaint.
      if (typeof d.selftext !== "string" || d.selftext.trim() === "") continue;
      items.push({
        source: "reddit",
        source_id: `${child.kind}_${d.id}`,
        url: `https://www.reddit.com${d.permalink}`,
        title: d.title,
        body: d.selftext,
        author: d.author,
        posted_at: new Date(d.created_utc * 1000).toISOString(),
        score: d.score,
        comments_count: d.num_comments,
      });
    }
    // Use the LAST subreddit's `after` as the cursor for the next run.
    // Per-subreddit cursors would require a different schema; sufficient for v1.
    nextCursor = body.data.after ?? nextCursor;
  }

  return { items, nextCursor };
};

export default reddit;
