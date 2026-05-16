import { describe, expect, it } from "vitest";
import { dedupRawSignals } from "@/server/inngest/functions/crawl.run";
import type { RawSignal } from "@/server/sources/types";

function r(source_id: string, source: RawSignal["source"] = "hn"): RawSignal {
  return {
    source,
    source_id,
    url: `https://example.com/${source}/${source_id}`,
    title: null,
    body: `body-${source_id}`,
    author: null,
    posted_at: new Date().toISOString(),
    score: null,
    comments_count: null,
  };
}

describe("dedupRawSignals", () => {
  it("removes duplicate rows by (source, source_id), preserving first occurrence", () => {
    const out = dedupRawSignals([r("a"), r("b"), r("a"), r("c"), r("b")]);
    expect(out.map((x) => x.source_id)).toEqual(["a", "b", "c"]);
  });

  it("treats the same source_id under different sources as distinct", () => {
    const out = dedupRawSignals([r("1", "hn"), r("1", "reddit"), r("1", "hn")]);
    expect(out.length).toBe(2);
    expect(out.map((x) => x.source).sort()).toEqual(["hn", "reddit"]);
  });

  it("returns [] for empty input", () => {
    expect(dedupRawSignals([])).toEqual([]);
  });
});
