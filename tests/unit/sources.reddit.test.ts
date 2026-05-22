import { beforeEach, describe, expect, it } from "vitest";
import reddit from "@/server/sources/reddit";
import { setStubRedditToken } from "@/server/auth/reddit_oauth";
import { createMockFetch, jsonResponse } from "./_helpers/mock-fetch";

beforeEach(() => {
  setStubRedditToken("stub-token");
});

const sampleListing = {
  data: {
    after: "t3_zzz",
    children: [
      {
        kind: "t3",
        data: {
          id: "abc",
          title: "Why is X always broken?",
          selftext: "I keep hitting the same bug with X every week.",
          author: "user1",
          permalink: "/r/SaaS/comments/abc/why_is_x_always_broken/",
          created_utc: 1700000000,
          score: 42,
          num_comments: 7,
        },
      },
      {
        kind: "t3",
        data: {
          id: "def",
          title: "Show HN: link only",
          selftext: "",
          author: "user2",
          permalink: "/r/SaaS/comments/def/show_hn_link_only/",
          created_utc: 1700001000,
          score: 5,
          num_comments: 0,
        },
      },
    ],
  },
};

describe("reddit crawler", () => {
  it("maps self-posts to RawSignal and skips link-posts", async () => {
    const mock = createMockFetch(async () => jsonResponse(sampleListing));
    const result = await reddit({
      cursor: null,
      params: { subreddits: ["SaaS"] },
      fetcher: mock.fetch,
    });
    expect(result.items.length).toBe(1);
    const [s] = result.items;
    expect(s).toBeDefined();
    if (s === undefined) return;
    expect(s.source).toBe("reddit");
    expect(s.source_id).toBe("t3_abc");
    expect(s.url).toBe("https://www.reddit.com/r/SaaS/comments/abc/why_is_x_always_broken/");
    expect(s.body).toContain("hitting the same bug");
    expect(s.score).toBe(42);
    expect(s.comments_count).toBe(7);
    expect(result.nextCursor).toBe("t3_zzz");
  });

  it("returns nothing when subreddits param is empty", async () => {
    const mock = createMockFetch(async () => jsonResponse(sampleListing));
    const result = await reddit({ cursor: null, params: { subreddits: [] }, fetcher: mock.fetch });
    expect(result.items.length).toBe(0);
    expect(mock.calls.length).toBe(0);
  });

  it("passes the cursor as `after` query param on subsequent calls", async () => {
    const mock = createMockFetch(async () => jsonResponse({ data: { after: null, children: [] } }));
    await reddit({ cursor: "t3_prev", params: { subreddits: ["SaaS"] }, fetcher: mock.fetch });
    const [first] = mock.calls;
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.url).toContain("after=t3_prev");
  });

  it("falls back to www.reddit.com anonymous JSON when OAuth token is null", async () => {
    // Force the anonymous return (mirrors "no REDDIT_CLIENT_ID/SECRET in env").
    setStubRedditToken("ANONYMOUS");
    try {
      const mock = createMockFetch(async () => jsonResponse(sampleListing));
      await reddit({ cursor: null, params: { subreddits: ["SaaS"] }, fetcher: mock.fetch });
      const [first] = mock.calls;
      expect(first).toBeDefined();
      if (first === undefined) return;
      expect(first.url).toContain("https://www.reddit.com/r/SaaS/new.json");
      const auth = (first.init?.headers as Record<string, string> | undefined)?.Authorization;
      expect(auth).toBeUndefined();
    } finally {
      // Restore the prior stub so other tests don't drift.
      setStubRedditToken("stub-token");
    }
  });
});
