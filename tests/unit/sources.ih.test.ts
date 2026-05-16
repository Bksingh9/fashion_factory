import { describe, expect, it } from "vitest";
import ih from "@/server/sources/ih";
import { createMockFetch } from "./_helpers/mock-fetch";

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, { status, headers: { "content-type": "text/html" } });
}

const SAMPLE_HTML = `
<html><body>
  <a href="/post/looking-for-stripe-alternative">
    <h3>Looking for a Stripe alternative</h3>
    <p class="excerpt">High fees + opaque holds. What are people using instead?</p>
    <span class="author">founder-A</span>
  </a>
  <a href="/post/saas-onboarding-pain">
    <h3>Why is SaaS onboarding so broken?</h3>
    <p class="excerpt">Every signup flow asks me the same 12 questions.</p>
  </a>
  <!-- Duplicate anchor for same post — must be deduped -->
  <a href="/post/looking-for-stripe-alternative">
    <h3>Looking for a Stripe alternative</h3>
  </a>
  <!-- Non-post anchor — must be skipped -->
  <a href="/about">About</a>
</body></html>
`;

describe("ih crawler", () => {
  it("scrapes /post/ anchors into RawSignal and dedupes duplicates", async () => {
    const mock = createMockFetch(async () => htmlResponse(SAMPLE_HTML));
    const result = await ih({ cursor: null, params: {}, fetcher: mock.fetch });
    expect(result.items.length).toBe(2);
    const stripe = result.items.find((i) => i.source_id === "looking-for-stripe-alternative");
    expect(stripe).toBeDefined();
    if (stripe === undefined) return;
    expect(stripe.source).toBe("ih");
    expect(stripe.url).toBe("https://www.indiehackers.com/post/looking-for-stripe-alternative");
    expect(stripe.title).toBe("Looking for a Stripe alternative");
    expect(stripe.body).toContain("High fees");
    expect(stripe.author).toBe("founder-A");
  });

  it("returns empty when the listing is empty or 404", async () => {
    const mock = createMockFetch(async () => htmlResponse("", 404));
    const result = await ih({ cursor: null, params: {}, fetcher: mock.fetch });
    expect(result.items.length).toBe(0);
  });
});
