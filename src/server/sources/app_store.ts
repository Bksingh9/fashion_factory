/**
 * Apple App Store crawler — public Customer Reviews RSS (JSON variant).
 *
 * Reads `params.app_ids: string[]` and `params.countries: string[]` from
 * the crawl_sources row. For each (country, appId) pair, fetches the
 * first page of newest reviews via Apple's iTunes RSS.
 *
 * The first entry in Apple's feed is the APP itself (name, icon, etc),
 * not a review — we skip entries that don't carry a rating.
 *
 * source_id uses Apple's review id (e.g. `"6843921021"`); dedup is at the
 * persist layer.
 */
import { limitCrawl } from "@/server/ratelimit";
import type { Crawler, RawSignal } from "./types";
import { paramStringArray } from "./types";

interface AppleLabel { label: string }
interface AppleEntry {
  id?: AppleLabel;
  title?: AppleLabel;
  content?: AppleLabel;
  author?: { name?: AppleLabel };
  updated?: AppleLabel;
  link?: { attributes?: { href?: string } }[] | { attributes?: { href?: string } };
  "im:rating"?: AppleLabel;
  "im:version"?: AppleLabel;
}
interface AppleFeed {
  feed?: {
    entry?: AppleEntry[] | AppleEntry;
  };
}

function asEntries(raw: AppleEntry[] | AppleEntry | undefined): AppleEntry[] {
  if (raw === undefined) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function firstLink(entry: AppleEntry): string {
  const link = entry.link;
  if (link === undefined) return "";
  if (Array.isArray(link)) return link[0]?.attributes?.href ?? "";
  return link.attributes?.href ?? "";
}

const app_store: Crawler = async ({ params, fetcher = fetch }) => {
  const limit = await limitCrawl("app_store");
  if (!limit.success) {
    throw new Error(
      `app_store: rate-limited; resets at ${new Date(limit.reset).toISOString()}`,
    );
  }

  const appIds = paramStringArray(params, "app_ids");
  const countries = paramStringArray(params, "countries");
  if (appIds.length === 0 || countries.length === 0) {
    return { items: [], nextCursor: null };
  }

  const items: RawSignal[] = [];
  for (const country of countries) {
    for (const appId of appIds) {
      const url = `https://itunes.apple.com/${country}/rss/customerreviews/page=1/id=${appId}/sortBy=mostRecent/json`;
      const res = await fetcher(url);
      if (!res.ok) {
        // App might be unavailable in that country — soft-skip, don't fail the whole run.
        continue;
      }
      const body = (await res.json()) as AppleFeed;
      for (const entry of asEntries(body.feed?.entry)) {
        // The leading entry that describes the app itself has no `im:rating`.
        const ratingLabel = entry["im:rating"]?.label;
        if (ratingLabel === undefined) continue;
        const rating = Number.parseInt(ratingLabel, 10);
        items.push({
          source: "app_store",
          source_id: entry.id?.label ?? `${country}-${appId}-${String(Date.now())}`,
          url: firstLink(entry),
          title: entry.title?.label ?? null,
          body: entry.content?.label ?? "",
          author: entry.author?.name?.label ?? null,
          posted_at: entry.updated?.label ?? new Date().toISOString(),
          score: Number.isNaN(rating) ? null : rating,
          comments_count: null,
        });
      }
    }
  }

  return { items, nextCursor: null };
};

export default app_store;
