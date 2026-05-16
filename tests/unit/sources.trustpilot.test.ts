import { describe, expect, it } from "vitest";
import trustpilot from "@/server/sources/trustpilot";
import { createMockFetch } from "./_helpers/mock-fetch";

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, { status, headers: { "content-type": "text/html" } });
}

const SAMPLE_HTML = `
<html><body>
  <article data-service-review-card-paper>
    <div data-review-id="rev-abc-123"></div>
    <h3 data-service-review-title-typography>Terrible support</h3>
    <p data-service-review-text-typography>Waited 3 weeks for a refund. Bug on checkout still not fixed.</p>
    <span data-consumer-name-typography>Jane Doe</span>
    <div data-service-review-rating data-rating="1"></div>
    <time datetime="2026-03-01T10:00:00Z">Mar 1</time>
  </article>
  <article data-service-review-card-paper>
    <div data-review-id="rev-def-456"></div>
    <h3 data-service-review-title-typography>Loved it</h3>
    <p data-service-review-text-typography>Fast, simple, great onboarding.</p>
    <span data-consumer-name-typography>John Smith</span>
    <div data-service-review-rating data-rating="5"></div>
    <time datetime="2026-03-02T14:00:00Z">Mar 2</time>
  </article>
  <article data-service-review-card-paper>
    <!-- Missing review id — must be skipped. -->
    <p data-service-review-text-typography>Empty card.</p>
  </article>
</body></html>
`;

describe("trustpilot crawler", () => {
  it("maps each review card to a RawSignal and skips cards without an id", async () => {
    const mock = createMockFetch(async () => htmlResponse(SAMPLE_HTML));
    const result = await trustpilot({
      cursor: null,
      params: { domains: ["example.com"] },
      fetcher: mock.fetch,
    });
    expect(result.items.length).toBe(2);
    const bad = result.items.find((i) => i.source_id === "rev-abc-123");
    expect(bad).toBeDefined();
    if (bad === undefined) return;
    expect(bad.source).toBe("trustpilot");
    expect(bad.title).toBe("Terrible support");
    expect(bad.body).toContain("Waited 3 weeks");
    expect(bad.author).toBe("Jane Doe");
    expect(bad.score).toBe(1);
    expect(bad.posted_at).toBe("2026-03-01T10:00:00Z");
  });

  it("returns empty when domains param is empty", async () => {
    const mock = createMockFetch(async () => htmlResponse(SAMPLE_HTML));
    const result = await trustpilot({
      cursor: null,
      params: { domains: [] },
      fetcher: mock.fetch,
    });
    expect(result.items.length).toBe(0);
    expect(mock.calls.length).toBe(0);
  });

  it("soft-skips when the page returns non-200", async () => {
    const mock = createMockFetch(async () => htmlResponse("404 page", 404));
    const result = await trustpilot({
      cursor: null,
      params: { domains: ["nope.example"] },
      fetcher: mock.fetch,
    });
    expect(result.items.length).toBe(0);
    expect(mock.calls.length).toBe(1);
  });
});
