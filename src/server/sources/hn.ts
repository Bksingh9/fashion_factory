/**
 * Hacker News crawler — Firebase API (no auth).
 *
 * Cursor = last-seen max item id (string). On each tick:
 *   1. GET /v0/maxitem.json → current max id.
 *   2. Walk down from `max` to `max(cursor+1, max - WINDOW)`, fetching each item.
 *   3. Keep stories/comments that carry a text body and look pain-shaped.
 *   4. Return rows + the new cursor (current max id).
 *
 * Rate limit is one `limitCrawl("hn")` token per crawler invocation. Individual
 * item fetches inside the tick don't take additional tokens — the cap that
 * matters is per-tick scheduling, not per-fetch.
 */
import { limitCrawl } from "@/server/ratelimit";
import type { Crawler, RawSignal } from "./types";

interface HnItem {
  id: number;
  type?: "story" | "comment" | "ask" | "show" | "job" | "poll" | "pollopt";
  by?: string;
  time?: number;
  text?: string;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number;
  dead?: boolean;
  deleted?: boolean;
}

/** Max items per tick. Prevents runaway fetches on a long gap between runs. */
const MAX_WINDOW = 150;

const hn: Crawler = async ({ cursor, fetcher = fetch }) => {
  const limit = await limitCrawl("hn");
  if (!limit.success) {
    throw new Error(
      `hn: rate-limited; resets at ${new Date(limit.reset).toISOString()}`,
    );
  }

  const maxRes = await fetcher("https://hacker-news.firebaseio.com/v0/maxitem.json");
  if (!maxRes.ok) {
    throw new Error(`hn: HTTP ${String(maxRes.status)} on maxitem`);
  }
  const max = (await maxRes.json()) as number;
  if (typeof max !== "number" || max <= 0) {
    throw new Error(`hn: malformed maxitem response`);
  }

  const lastSeen = cursor !== null ? Number.parseInt(cursor, 10) : max - MAX_WINDOW;
  const floor = Math.max(lastSeen, max - MAX_WINDOW);

  const items: RawSignal[] = [];
  for (let id = max; id > floor; id--) {
    const r = await fetcher(`https://hacker-news.firebaseio.com/v0/item/${String(id)}.json`);
    if (!r.ok) continue;
    const item = (await r.json()) as HnItem | null;
    if (item === null) continue;
    if (item.dead === true || item.deleted === true) continue;
    if (item.type !== "story" && item.type !== "comment" && item.type !== "ask") continue;
    if (typeof item.time !== "number") continue;
    const body = item.text ?? item.title ?? "";
    if (body.trim() === "") continue;
    items.push({
      source: "hn",
      source_id: String(item.id),
      url: item.url ?? `https://news.ycombinator.com/item?id=${String(item.id)}`,
      title: item.title ?? null,
      body,
      author: item.by ?? null,
      posted_at: new Date(item.time * 1000).toISOString(),
      score: item.score ?? null,
      comments_count: item.descendants ?? null,
    });
  }

  return { items, nextCursor: String(max) };
};

export default hn;
