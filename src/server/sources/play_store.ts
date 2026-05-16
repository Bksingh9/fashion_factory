/**
 * Google Play crawler — HTML scrape of the app's details page.
 *
 * Reads `params.package_ids: string[]`. Google Play renders the top
 * recent reviews server-side on `play.google.com/store/apps/details?id=<pkg>`.
 * Deeper pagination uses an undocumented protobuf-like POST API that
 * the Play SDK doesn't open to public reads — we stay on page 1 here
 * and document the limitation. Selectors target the review block that
 * Google currently renders (jsname attributes); they're fragile and
 * tuned by inspecting live HTML.
 *
 * Returns a defensible-best-effort RawSignal per review found.
 */
import * as cheerio from "cheerio";
import { limitCrawl } from "@/server/ratelimit";
import type { Crawler, RawSignal } from "./types";
import { paramStringArray } from "./types";

const play_store: Crawler = async ({ params, fetcher = fetch }) => {
  const limit = await limitCrawl("play_store");
  if (!limit.success) {
    throw new Error(
      `play_store: rate-limited; resets at ${new Date(limit.reset).toISOString()}`,
    );
  }

  const packageIds = paramStringArray(params, "package_ids");
  if (packageIds.length === 0) return { items: [], nextCursor: null };

  const items: RawSignal[] = [];
  for (const pkg of packageIds) {
    const url = `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}&hl=en&gl=US`;
    const res = await fetcher(url, {
      headers: { "User-Agent": "PainPilot/0.1 (+contact: hello@painpilot.dev)" },
    });
    if (!res.ok) continue;
    const $ = cheerio.load(await res.text());

    // Google renders top reviews inside [data-review-id] blocks. The body is
    // usually under [jsname='bN97Pc'] or a child span; star count under an
    // aria-label like "Rated 5 stars out of five stars".
    $("[data-review-id]").each((_idx, el) => {
      const $el = $(el);
      const reviewId = $el.attr("data-review-id");
      if (reviewId === undefined || reviewId.length === 0) return;

      const body =
        $el.find("[jsname='bN97Pc']").text().trim() ||
        $el.find("[jsname='fbQN7e']").text().trim();
      if (body.length === 0) return;

      const author =
        $el.find("header span").first().text().trim() ||
        $el.find("[class*='author']").first().text().trim() ||
        null;
      const ariaLabel = $el.find("[role='img']").attr("aria-label") ?? "";
      const ratingMatch = /Rated\s+(\d+)/i.exec(ariaLabel);
      const score = ratingMatch !== null ? Number.parseInt(ratingMatch[1] ?? "", 10) : null;
      const dateAttr = $el.find("time").attr("datetime");

      items.push({
        source: "play_store",
        source_id: reviewId,
        url: `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}&reviewId=${encodeURIComponent(reviewId)}`,
        title: null,
        body,
        author,
        posted_at: dateAttr ?? new Date().toISOString(),
        score: score !== null && Number.isFinite(score) ? score : null,
        comments_count: null,
      });
    });
  }

  return { items, nextCursor: null };
};

export default play_store;
