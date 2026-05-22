/**
 * GitHub Issues crawler — `api.github.com/search/issues`.
 *
 * No auth required (60 req/h public rate limit; plenty for the cron
 * cadence). Reads `params.queries: string[]` and `params.per_page` from
 * the crawl_sources row. Each query is a GitHub search syntax string
 * (e.g. `"I wish there was" in:title,body is:issue is:open`).
 *
 * Per CI guard: this is a READ-only GET. No POSTs, no social-domain
 * writes — api.github.com isn't in the social-network regex anyway.
 */
import { limitCrawl } from "@/server/ratelimit";
import type { Crawler, RawSignal } from "./types";
import { paramStringArray } from "./types";

interface GhIssueItem {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  comments: number;
  reactions?: { total_count: number };
  user?: { login: string };
  created_at: string;
  updated_at: string;
}

interface GhSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GhIssueItem[];
}

const ENDPOINT = "https://api.github.com/search/issues";

const github_issues: Crawler = async ({ params, fetcher = fetch }) => {
  // Short-circuit BEFORE the rate-limit slot — empty params shouldn't burn budget.
  const queries = paramStringArray(params, "queries");
  if (queries.length === 0) return { items: [], nextCursor: null };
  const perPage = typeof params.per_page === "number" ? params.per_page : 25;

  const limit = await limitCrawl("github_issues");
  if (!limit.success) {
    throw new Error(
      `github_issues: rate-limited; resets at ${new Date(limit.reset).toISOString()}`,
    );
  }

  const items: RawSignal[] = [];
  for (const q of queries) {
    const url = new URL(ENDPOINT);
    url.searchParams.set("q", q);
    url.searchParams.set("sort", "updated");
    url.searchParams.set("order", "desc");
    url.searchParams.set("per_page", String(perPage));

    const res = await fetcher(url.toString(), {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "PainPilot/0.1 (+contact: hello@painpilot.dev)",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) continue; // soft-skip on 403 (rate-limited) etc.
    const body = (await res.json()) as GhSearchResponse;
    for (const it of body.items) {
      const text = it.body ?? "";
      if (text.trim().length === 0) continue;
      items.push({
        source: "github_issues",
        source_id: `gh-${String(it.id)}`,
        url: it.html_url,
        title: it.title,
        body: text,
        author: it.user?.login ?? null,
        posted_at: it.created_at,
        score: it.reactions?.total_count ?? null,
        comments_count: it.comments,
      });
    }
  }

  return { items, nextCursor: null };
};

export default github_issues;
