/**
 * Shared crawler types.
 *
 * Every crawler module under /src/server/sources/ exports a default
 * `Crawler` — a pure function (no DB / event side effects). The Inngest
 * `crawl.run` worker (chunk 4) calls it, persists results, and fans out
 * `signal.ingested` events. Keeping crawlers pure makes them trivially
 * unit-testable: pass a fixture fetcher in `args.fetcher`, get rows back.
 *
 * `STUB_CRAWLER=1` is the test/sandbox hint — individual modules may
 * choose to short-circuit (return canned data) when set. Tests typically
 * inject the fixture fetcher directly instead.
 */
import type { CrawlSourceId } from "@/types/database";

export type CrawlSource = CrawlSourceId;

export interface RawSignal {
  source: CrawlSource;
  source_id: string;
  url: string;
  title: string | null;
  body: string;
  author: string | null;
  /** ISO timestamp. */
  posted_at: string;
  score: number | null;
  comments_count: number | null;
}

export interface CrawlerArgs {
  cursor: string | null;
  params: Record<string, unknown>;
  /** Optional fetch override for tests/fixtures. Defaults to global fetch. */
  fetcher?: typeof fetch;
}

export interface CrawlFetchResult {
  items: RawSignal[];
  nextCursor: string | null;
}

export type Crawler = (args: CrawlerArgs) => Promise<CrawlFetchResult>;

export function isStubCrawler(): boolean {
  return process.env.STUB_CRAWLER === "1";
}

export function paramStringArray(params: Record<string, unknown>, key: string): string[] {
  const val = params[key];
  if (!Array.isArray(val)) return [];
  return val.filter((v): v is string => typeof v === "string");
}
