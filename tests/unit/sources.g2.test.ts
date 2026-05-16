import { describe, expect, it } from "vitest";
import g2 from "@/server/sources/g2";
import { createMockFetch } from "./_helpers/mock-fetch";

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, { status, headers: { "content-type": "text/html" } });
}

const SAMPLE_HTML = `
<html><body>
  <div itemprop="review" id="rev-100">
    <h3 itemprop="name">Powerful but buggy</h3>
    <p itemprop="reviewBody">Reports break on Safari every time. Support is slow.</p>
    <span itemprop="author">Acme PM</span>
    <meta itemprop="ratingValue" content="3" />
    <meta itemprop="datePublished" content="2026-02-14" />
  </div>
  <div itemprop="review" id="rev-101">
    <h3 itemprop="name">Solid daily driver</h3>
    <p itemprop="reviewBody">We use it across the team and it Just Works.</p>
    <span itemprop="author">Brittle Co</span>
    <meta itemprop="ratingValue" content="4.5" />
    <meta itemprop="datePublished" content="2026-02-15" />
  </div>
  <div itemprop="review" id="rev-skip">
    <h3 itemprop="name">No body</h3>
    <p itemprop="reviewBody"></p>
  </div>
</body></html>
`;

describe("g2 crawler", () => {
  it("maps schema.org review blocks to RawSignal and skips bodyless rows", async () => {
    const mock = createMockFetch(async () => htmlResponse(SAMPLE_HTML));
    const result = await g2({
      cursor: null,
      params: { products: ["acme-tool"] },
      fetcher: mock.fetch,
    });
    expect(result.items.length).toBe(2);
    const r1 = result.items.find((i) => i.source_id === "rev-100");
    expect(r1).toBeDefined();
    if (r1 === undefined) return;
    expect(r1.source).toBe("g2");
    expect(r1.title).toBe("Powerful but buggy");
    expect(r1.body).toContain("Reports break");
    expect(r1.author).toBe("Acme PM");
    expect(r1.score).toBe(3);
    const r2 = result.items.find((i) => i.source_id === "rev-101");
    expect(r2).toBeDefined();
    if (r2 === undefined) return;
    expect(r2.score).toBe(4.5);
  });

  it("returns empty when products param is empty", async () => {
    const mock = createMockFetch(async () => htmlResponse(SAMPLE_HTML));
    const result = await g2({
      cursor: null,
      params: { products: [] },
      fetcher: mock.fetch,
    });
    expect(result.items.length).toBe(0);
    expect(mock.calls.length).toBe(0);
  });
});
