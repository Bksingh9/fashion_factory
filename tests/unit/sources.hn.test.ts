import { describe, expect, it } from "vitest";
import hn from "@/server/sources/hn";
import { createMockFetch, jsonResponse } from "./_helpers/mock-fetch";

describe("hn crawler", () => {
  it("walks from maxitem down to cursor, mapping stories/comments to RawSignal", async () => {
    const maxId = 100;
    const itemsById: Record<number, unknown> = {
      100: { id: 100, type: "story", by: "user1", time: 1700000000, title: "T1", text: "story body 1", url: "https://x.example/1", score: 7, descendants: 2 },
      99:  { id: 99,  type: "comment", by: "user2", time: 1700000010, text: "comment body" },
      98:  { id: 98,  type: "story", by: "user3", time: 1700000020, title: "T3", text: "" },           // empty body → skipped
      97:  { id: 97,  type: "job", by: "user4", time: 1700000030, title: "Hiring" },                    // type filter → skipped
      96:  { id: 96,  type: "story", by: "user5", time: 1700000040, title: "T5", text: "" },           // empty body → skipped
      95:  { id: 95,  type: "story", deleted: true, time: 1700000050, title: "deleted" },              // deleted → skipped
    };

    const mock = createMockFetch(async (url) => {
      if (url.endsWith("/maxitem.json")) return jsonResponse(maxId);
      const m = /item\/(\d+)\.json/.exec(url);
      if (m === null) return jsonResponse(null);
      const id = Number.parseInt(m[1] ?? "0", 10);
      return jsonResponse(itemsById[id] ?? null);
    });

    const result = await hn({ cursor: "94", params: {}, fetcher: mock.fetch });
    expect(result.nextCursor).toBe("100");
    expect(result.items.map((i) => i.source_id).sort()).toEqual(["100", "99"]);
    const story = result.items.find((i) => i.source_id === "100");
    expect(story).toBeDefined();
    if (story === undefined) return;
    expect(story.source).toBe("hn");
    expect(story.url).toBe("https://x.example/1");
    expect(story.title).toBe("T1");
    expect(story.author).toBe("user1");
  });

  it("uses the HN item URL fallback when item.url is undefined", async () => {
    const itemsById: Record<number, unknown> = {
      10: { id: 10, type: "ask", by: "asker", time: 1700000000, title: "Ask HN: …", text: "Some ask body" },
    };
    const mock = createMockFetch(async (url) => {
      if (url.endsWith("/maxitem.json")) return jsonResponse(10);
      const m = /item\/(\d+)\.json/.exec(url);
      if (m === null) return jsonResponse(null);
      const id = Number.parseInt(m[1] ?? "0", 10);
      return jsonResponse(itemsById[id] ?? null);
    });

    const result = await hn({ cursor: "9", params: {}, fetcher: mock.fetch });
    expect(result.items.length).toBe(1);
    const [item] = result.items;
    expect(item).toBeDefined();
    if (item === undefined) return;
    expect(item.url).toBe("https://news.ycombinator.com/item?id=10");
  });
});
