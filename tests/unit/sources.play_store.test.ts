import { describe, expect, it } from "vitest";
import play_store from "@/server/sources/play_store";
import { createMockFetch } from "./_helpers/mock-fetch";

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, { status, headers: { "content-type": "text/html" } });
}

const SAMPLE_HTML = `
<html><body>
  <div data-review-id="play-rev-1">
    <header><span>Alice</span></header>
    <div jsname="bN97Pc">App crashes whenever I tap the search icon.</div>
    <div role="img" aria-label="Rated 2 stars out of five stars"></div>
    <time datetime="2026-01-20T10:00:00Z">Jan 20</time>
  </div>
  <div data-review-id="play-rev-2">
    <header><span>Bob</span></header>
    <div jsname="bN97Pc">Works fine, no issues.</div>
    <div role="img" aria-label="Rated 5 stars out of five stars"></div>
    <time datetime="2026-01-21T10:00:00Z">Jan 21</time>
  </div>
  <div data-review-id="play-rev-empty">
    <header><span>Carol</span></header>
    <div jsname="bN97Pc"></div>
  </div>
</body></html>
`;

describe("play_store crawler", () => {
  it("maps review blocks to RawSignal and skips empty bodies", async () => {
    const mock = createMockFetch(async () => htmlResponse(SAMPLE_HTML));
    const result = await play_store({
      cursor: null,
      params: { package_ids: ["com.example.app"] },
      fetcher: mock.fetch,
    });
    expect(result.items.length).toBe(2);
    const first = result.items.find((i) => i.source_id === "play-rev-1");
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.source).toBe("play_store");
    expect(first.body).toContain("crashes whenever I tap the search icon");
    expect(first.score).toBe(2);
    expect(first.author).toBe("Alice");
    expect(first.posted_at).toBe("2026-01-20T10:00:00Z");
  });

  it("returns empty when package_ids is empty", async () => {
    const mock = createMockFetch(async () => htmlResponse(SAMPLE_HTML));
    const result = await play_store({
      cursor: null,
      params: { package_ids: [] },
      fetcher: mock.fetch,
    });
    expect(result.items.length).toBe(0);
    expect(mock.calls.length).toBe(0);
  });
});
