import { describe, expect, it } from "vitest";
import app_store from "@/server/sources/app_store";
import { createMockFetch, jsonResponse } from "./_helpers/mock-fetch";

describe("app_store crawler", () => {
  it("maps Apple RSS entries to RawSignal and skips the app-metadata entry", async () => {
    const feed = {
      feed: {
        entry: [
          // First entry is the APP itself (no im:rating) → must be skipped.
          {
            id: { label: "https://apps.apple.com/us/app/example/id123" },
            title: { label: "Example App" },
          },
          {
            id: { label: "9999900001" },
            title: { label: "Crashes on launch" },
            content: { label: "The app crashes on iOS 18 every time I open it." },
            author: { name: { label: "JohnDoe123" } },
            updated: { label: "2026-04-15T10:00:00-07:00" },
            link: { attributes: { href: "https://example.com/review/1" } },
            "im:rating": { label: "1" },
            "im:version": { label: "2.3.0" },
          },
          {
            id: { label: "9999900002" },
            title: { label: "Love it" },
            content: { label: "Works great!" },
            author: { name: { label: "JaneDoe" } },
            updated: { label: "2026-04-16T08:00:00-07:00" },
            link: [{ attributes: { href: "https://example.com/review/2" } }],
            "im:rating": { label: "5" },
          },
        ],
      },
    };

    const mock = createMockFetch(async () => jsonResponse(feed));
    const result = await app_store({
      cursor: null,
      params: { app_ids: ["123"], countries: ["us"] },
      fetcher: mock.fetch,
    });
    expect(result.items.length).toBe(2);
    const ids = result.items.map((i) => i.source_id).sort();
    expect(ids).toEqual(["9999900001", "9999900002"]);
    const crash = result.items.find((i) => i.source_id === "9999900001");
    expect(crash).toBeDefined();
    if (crash === undefined) return;
    expect(crash.source).toBe("app_store");
    expect(crash.score).toBe(1);
    expect(crash.body).toContain("crashes on iOS 18");
    expect(crash.author).toBe("JohnDoe123");
  });

  it("returns empty when app_ids or countries are empty", async () => {
    const mock = createMockFetch(async () => jsonResponse({ feed: { entry: [] } }));
    const result = await app_store({
      cursor: null,
      params: { app_ids: [], countries: ["us"] },
      fetcher: mock.fetch,
    });
    expect(result.items.length).toBe(0);
    expect(mock.calls.length).toBe(0);
  });

  it("handles entry being a single object (not an array)", async () => {
    const feed = {
      feed: {
        entry: {
          id: { label: "9999900003" },
          title: { label: "Single entry" },
          content: { label: "Just one review." },
          author: { name: { label: "OnlyUser" } },
          updated: { label: "2026-04-17T00:00:00Z" },
          link: { attributes: { href: "https://example.com/3" } },
          "im:rating": { label: "3" },
        },
      },
    };
    const mock = createMockFetch(async () => jsonResponse(feed));
    const result = await app_store({
      cursor: null,
      params: { app_ids: ["999"], countries: ["us"] },
      fetcher: mock.fetch,
    });
    expect(result.items.length).toBe(1);
    const [signal] = result.items;
    expect(signal).toBeDefined();
    if (signal === undefined) return;
    expect(signal.source_id).toBe("9999900003");
    expect(signal.score).toBe(3);
  });
});
