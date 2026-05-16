/**
 * G2 crawler — HTML scrape of `/products/{slug}/reviews`.
 *
 * G2 has strong anti-bot defences; this crawler is best-effort. Selectors
 * target review cards with the `.paper--white` class + nested `[itemprop]`
 * attributes that G2 exposes for schema.org structured data. Defensive
 * mapping — any missing field skips the row.
 */
import * as cheerio from "cheerio";
import { limitCrawl } from "@/server/ratelimit";
import type { Crawler, RawSignal } from "./types";
import { paramStringArray } from "./types";

const g2: Crawler = async ({ params, fetcher = fetch }) => {
  const limit = await limitCrawl("g2");
  if (!limit.success) {
    throw new Error(
      `g2: rate-limited; resets at ${new Date(limit.reset).toISOString()}`,
    );
  }

  const products = paramStringArray(params, "products");
  if (products.length === 0) return { items: [], nextCursor: null };

  const items: RawSignal[] = [];
  for (const slug of products) {
    const url = `https://www.g2.com/products/${slug}/reviews`;
    const res = await fetcher(url, {
      headers: { "User-Agent": "PainPilot/0.1 (+contact: hello@painpilot.dev)" },
    });
    if (!res.ok) continue;
    const $ = cheerio.load(await res.text());

    $("[itemprop='review']").each((_idx, el) => {
      const $el = $(el);
      const reviewId = $el.attr("id") ?? $el.find("[data-review-id]").attr("data-review-id");
      if (reviewId === undefined || reviewId.length === 0) return;

      const title = $el.find("[itemprop='name']").first().text().trim();
      const body = $el.find("[itemprop='reviewBody']").text().trim();
      if (body.length === 0) return;

      const author = $el.find("[itemprop='author']").first().text().trim() || null;
      const ratingValue = $el.find("[itemprop='ratingValue']").attr("content");
      const score = ratingValue !== undefined ? Number.parseFloat(ratingValue) : null;
      const datePublished = $el.find("[itemprop='datePublished']").attr("content");

      items.push({
        source: "g2",
        source_id: reviewId,
        url: `https://www.g2.com/products/${slug}/reviews#${reviewId}`,
        title: title.length > 0 ? title : null,
        body,
        author,
        posted_at: datePublished ?? new Date().toISOString(),
        score: score !== null && Number.isFinite(score) ? score : null,
        comments_count: null,
      });
    });
  }

  return { items, nextCursor: null };
};

export default g2;
