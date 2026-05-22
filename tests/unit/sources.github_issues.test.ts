import { describe, expect, it } from "vitest";
import github_issues from "@/server/sources/github_issues";
import { createMockFetch, jsonResponse } from "./_helpers/mock-fetch";

describe("github_issues crawler", () => {
  it("maps issue search results to RawSignal and skips empty bodies", async () => {
    const feed = {
      total_count: 2,
      incomplete_results: false,
      items: [
        {
          id: 9001,
          number: 12,
          title: "App crashes on startup after upgrade",
          body: "Reproducible on 3 separate machines after v2.0. See attached logs.",
          state: "open",
          html_url: "https://github.com/acme/widget/issues/12",
          comments: 8,
          reactions: { total_count: 15 },
          user: { login: "frustrated-dev" },
          created_at: "2026-04-01T10:00:00Z",
          updated_at: "2026-04-02T10:00:00Z",
        },
        {
          id: 9002,
          number: 13,
          title: "(no body issue)",
          body: null,
          state: "open",
          html_url: "https://github.com/acme/widget/issues/13",
          comments: 0,
          user: { login: "drive-by" },
          created_at: "2026-04-03T10:00:00Z",
          updated_at: "2026-04-03T10:00:00Z",
        },
      ],
    };

    const mock = createMockFetch(async () => jsonResponse(feed));
    const result = await github_issues({
      cursor: null,
      params: { queries: ["is:issue label:bug"], per_page: 25 },
      fetcher: mock.fetch,
    });
    expect(result.items.length).toBe(1);
    const [signal] = result.items;
    expect(signal).toBeDefined();
    if (signal === undefined) return;
    expect(signal.source).toBe("github_issues");
    expect(signal.source_id).toBe("gh-9001");
    expect(signal.title).toContain("App crashes");
    expect(signal.body).toContain("Reproducible");
    expect(signal.author).toBe("frustrated-dev");
    expect(signal.score).toBe(15);
    expect(signal.comments_count).toBe(8);
  });

  it("returns empty when queries is empty", async () => {
    const mock = createMockFetch(async () =>
      jsonResponse({ total_count: 0, incomplete_results: false, items: [] }),
    );
    const result = await github_issues({
      cursor: null,
      params: { queries: [] },
      fetcher: mock.fetch,
    });
    expect(result.items.length).toBe(0);
    expect(mock.calls.length).toBe(0);
  });
});
