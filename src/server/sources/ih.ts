/**
 * Indie Hackers crawler — HTML scrape of `/forum`.
 *
 * IH renders the forum's recent posts server-side. We pick up the
 * teaser body from the listing; full post bodies require a follow-up
 * fetch per post (deferred — listing teasers are signal-rich enough for
 * v1 clustering). Selectors target the thread-card structure as
 * rendered today.
 */
import * as cheerio from "cheerio";
import { limitCrawl } from "@/server/ratelimit";
import type { Crawler, RawSignal } from "./types";

const ih: Crawler = async ({ fetcher = fetch }) => {
  const limit = await limitCrawl("ih");
  if (!limit.success) {
    throw new Error(
      `ih: rate-limited; resets at ${new Date(limit.reset).toISOString()}`,
    );
  }

  const url = "https://www.indiehackers.com/forum";
  const res = await fetcher(url, {
    headers: { "User-Agent": "PainPilot/0.1 (+contact: hello@painpilot.dev)" },
  });
  if (!res.ok) return { items: [], nextCursor: null };
  const $ = cheerio.load(await res.text());

  const items: RawSignal[] = [];
  $("a[href*='/post/']").each((_idx, el) => {
    const $el = $(el);
    const href = $el.attr("href") ?? "";
    // Normalise to a stable id: the trailing slug after /post/.
    const idMatch = /\/post\/([^/?#]+)/.exec(href);
    if (idMatch === null) return;
    const sourceId = idMatch[1] ?? "";
    if (sourceId.length === 0) return;

    const title = $el.find("h3, h4, [class*='title']").first().text().trim();
    const body =
      $el.find("[class*='excerpt']").first().text().trim() ||
      $el.find("p").first().text().trim();
    if (title.length === 0 && body.length === 0) return;

    items.push({
      source: "ih",
      source_id: sourceId,
      url: href.startsWith("http") ? href : `https://www.indiehackers.com${href}`,
      title: title.length > 0 ? title : null,
      body: body.length > 0 ? body : title,
      author: $el.find("[class*='author']").first().text().trim() || null,
      posted_at: new Date().toISOString(),
      score: null,
      comments_count: null,
    });
  });

  // Dedup by source_id (the same anchor often appears more than once on a listing).
  const seen = new Set<string>();
  const dedup: RawSignal[] = [];
  for (const r of items) {
    if (seen.has(r.source_id)) continue;
    seen.add(r.source_id);
    dedup.push(r);
  }

  return { items: dedup, nextCursor: null };
};

export default ih;
