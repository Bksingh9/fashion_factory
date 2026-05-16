/**
 * Product Hunt crawler — GraphQL v2 API.
 *
 * Posts the same `query` body on every tick; `cursor` is the GraphQL
 * connection cursor (endCursor). The POST goes to `api.producthunt.com`
 * — not a social-network domain — so the no_auto_post CI guard doesn't
 * fire, but it's still a read-only query (GraphQL idiom).
 *
 * Each Product Hunt post is treated as a complaint surface: people
 * comment with feedback / wishes / gripes the launching team didn't ship.
 * The post's `tagline + description` becomes the signal body; the post
 * URL surfaces the comment thread for later validation.
 */
import { env } from "@/env";
import { limitCrawl } from "@/server/ratelimit";
import type { Crawler, RawSignal } from "./types";

const ENDPOINT = "https://api.producthunt.com/v2/api/graphql";

const QUERY = `
query ProductHuntPosts($after: String) {
  posts(order: NEWEST, after: $after, first: 25) {
    edges {
      node {
        id
        slug
        name
        tagline
        description
        createdAt
        votesCount
        commentsCount
        user { username }
      }
      cursor
    }
    pageInfo {
      endCursor
      hasNextPage
    }
  }
}
`.trim();

interface PhUser { username: string | null }
interface PhNode {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  createdAt: string;
  votesCount: number | null;
  commentsCount: number | null;
  user: PhUser | null;
}
interface PhEdge { node: PhNode; cursor: string }
interface PhResponse {
  data?: {
    posts: {
      edges: PhEdge[];
      pageInfo: { endCursor: string | null; hasNextPage: boolean };
    };
  };
  errors?: unknown;
}

const ph: Crawler = async ({ cursor, fetcher = fetch }) => {
  const limit = await limitCrawl("ph");
  if (!limit.success) {
    throw new Error(
      `ph: rate-limited; resets at ${new Date(limit.reset).toISOString()}`,
    );
  }

  const res = await fetcher(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.PRODUCT_HUNT_API_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query: QUERY, variables: { after: cursor } }),
  });
  if (!res.ok) {
    throw new Error(`ph: HTTP ${String(res.status)} ${await res.text()}`);
  }
  const body = (await res.json()) as PhResponse;
  if (body.errors !== undefined) {
    throw new Error(`ph: GraphQL errors ${JSON.stringify(body.errors)}`);
  }
  const edges = body.data?.posts.edges ?? [];

  const items: RawSignal[] = edges.map((e): RawSignal => {
    const node = e.node;
    const tagline = node.tagline ?? "";
    const description = node.description ?? "";
    return {
      source: "ph",
      source_id: node.id,
      url: `https://www.producthunt.com/posts/${node.slug}`,
      title: node.name,
      body: [tagline, description].filter((s) => s.length > 0).join("\n\n"),
      author: node.user?.username ?? null,
      posted_at: node.createdAt,
      score: node.votesCount,
      comments_count: node.commentsCount,
    };
  });

  return { items, nextCursor: body.data?.posts.pageInfo.endCursor ?? null };
};

export default ph;
