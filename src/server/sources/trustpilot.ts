/**
 * Trustpilot crawler — HTML scrape of `/review/{domain}`.
 *
 * Reads `params.domains: string[]`. Trustpilot doesn't offer a free
 * read API, so we parse the public review listing. Selectors target
 * Trustpilot's stable `data-service-review-*` attributes; they may
 * drift across redesigns. Crawler is defensive — missing fields
 * yield a skip, not a throw.
 */
import * as cheerio from "cheerio";
import { limitCrawl } from "@/server/ratelimit";
import type { Crawler, RawSignal } from "./types";
import { paramStringArray } from "./types";

const trustpilot: Crawler = async ({ params, fetcher = fetch }) => {
  const limit = await limitCrawl("trustpilot");
  if (!limit.success) {
    throw new Error(
      `trustpilot: rate-limited; resets at ${new Date(limit.reset).toISOString()}`,
    );
  }

  const domains = paramStringArray(params, "domains");
  if (domains.length === 0) return { items: [], nextCursor: null };

  const items: RawSignal[] = [];
  for (const domain of domains) {
    const url = `https://www.trustpilot.com/review/${domain}?sort=recency`;
    const res = await fetcher(url);
    if (!res.ok) continue;
    const $ = cheerio.load(await res.text());

    $("article[data-service-review-card-paper]").each((_idx, el) => {
      const $el = $(el);
      const reviewId = $el.find("[data-review-id]").attr("data-review-id");
      if (reviewId === undefined || reviewId.length === 0) return;

      const title = $el.find("[data-service-review-title-typography]").text().trim();
      const body = $el.find("[data-service-review-text-typography]").text().trim();
      if (body.length === 0) return;

      const author =
        $el.find("[data-consumer-name-typography]").text().trim() || null;
      const ratingAttr = $el
        .find("[data-service-review-rating]")
        .attr("data-rating");
      const score = ratingAttr !== undefined ? Number.parseInt(ratingAttr, 10) : null;
      const postedAt = $el.find("time").attr("datetime") ?? new Date().toISOString();

      items.push({
        source: "trustpilot",
        source_id: reviewId,
        url: `https://www.trustpilot.com/reviews/${reviewId}`,
        title: title.length > 0 ? title : null,
        body,
        author,
        posted_at: postedAt,
        score: score !== null && Number.isFinite(score) ? score : null,
        comments_count: null,
      });
    });
  }

  return { items, nextCursor: null };
};

export default trustpilot;
