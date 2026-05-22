import { describe, expect, it } from "vitest";
import devto from "@/server/sources/devto";
import { createMockFetch, jsonResponse } from "./_helpers/mock-fetch";

describe("devto crawler", () => {
  it("maps article objects to RawSignal and advances page cursor", async () => {
    const feed = [
      {
        id: 5001,
        title: "Why is auth still so painful in 2026?",
        description: "Every framework reinvents it slightly differently and breaks the basics.",
        url: "https://dev.to/founder-a/why-is-auth-still-so-painful-in-2026",
        comments_count: 23,
        positive_reactions_count: 142,
        published_at: "2026-05-01T12:00:00Z",
        user: { username: "founder-a" },
      },
      {
        id: 5002,
        title: "(no body)",
        description: null,
        url: "https://dev.to/none/blank",
        comments_count: 0,
        positive_reactions_count: 0,
        published_at: "2026-05-01T13:00:00Z",
        user: { username: "blanky" },
      },
    ];

    const mock = createMockFetch(async () => jsonResponse(feed));
    const result = await devto({
      cursor: "2",
      params: { tags: ["webdev"], per_page: 30 },
      fetcher: mock.fetch,
    });
    expect(result.items.length).toBe(1);
    const [signal] = result.items;
    expect(signal).toBeDefined();
    if (signal === undefined) return;
    expect(signal.source).toBe("devto");
    expect(signal.source_id).toBe("devto-5001");
    expect(signal.author).toBe("founder-a");
    expect(signal.score).toBe(142);
    expect(signal.comments_count).toBe(23);
    expect(signal.body).toContain("Every framework");
    // Cursor advances by 1
    expect(result.nextCursor).toBe("3");
  });

  it("requests with no tag when tags param is empty", async () => {
    const mock = createMockFetch(async () => jsonResponse([]));
    const result = await devto({
      cursor: null,
      params: {},
      fetcher: mock.fetch,
    });
    expect(result.items.length).toBe(0);
    expect(mock.calls.length).toBe(1);
    expect(mock.calls[0]?.url).not.toContain("tag=");
  });
});
