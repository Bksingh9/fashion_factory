import { describe, expect, it } from "vitest";
import ph from "@/server/sources/ph";
import { createMockFetch, jsonResponse } from "./_helpers/mock-fetch";

describe("ph (Product Hunt) crawler", () => {
  it("maps GraphQL nodes to RawSignal and threads the cursor", async () => {
    const mock = createMockFetch(async () =>
      jsonResponse({
        data: {
          posts: {
            edges: [
              {
                node: {
                  id: "ph-post-1",
                  slug: "great-product",
                  name: "Great Product",
                  tagline: "Solves X",
                  description: "Deep dive: solves X for Y audience.",
                  createdAt: "2026-05-01T12:00:00Z",
                  votesCount: 120,
                  commentsCount: 17,
                  user: { username: "maker1" },
                },
                cursor: "cursor-1",
              },
            ],
            pageInfo: { endCursor: "endcursor-XYZ", hasNextPage: true },
          },
        },
      }),
    );

    const result = await ph({ cursor: null, params: {}, fetcher: mock.fetch });
    expect(result.nextCursor).toBe("endcursor-XYZ");
    expect(result.items.length).toBe(1);
    const [signal] = result.items;
    expect(signal).toBeDefined();
    if (signal === undefined) return;
    expect(signal.source).toBe("ph");
    expect(signal.source_id).toBe("ph-post-1");
    expect(signal.url).toBe("https://www.producthunt.com/posts/great-product");
    expect(signal.body).toContain("Solves X");
    expect(signal.body).toContain("Deep dive");
    expect(signal.author).toBe("maker1");
    expect(signal.score).toBe(120);
    expect(signal.comments_count).toBe(17);
  });

  it("throws on GraphQL errors", async () => {
    const mock = createMockFetch(async () => jsonResponse({ errors: [{ message: "unauthorized" }] }));
    await expect(ph({ cursor: null, params: {}, fetcher: mock.fetch })).rejects.toThrow(/GraphQL errors/);
  });

  it("sends Authorization Bearer + POST to the GraphQL endpoint with the cursor variable", async () => {
    const mock = createMockFetch(async () =>
      jsonResponse({ data: { posts: { edges: [], pageInfo: { endCursor: null, hasNextPage: false } } } }),
    );
    await ph({ cursor: "page-2", params: {}, fetcher: mock.fetch });
    const [first] = mock.calls;
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.url).toBe("https://api.producthunt.com/v2/api/graphql");
    expect(first.init?.method).toBe("POST");
    const headers = first.init?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toMatch(/^Bearer /);
    const bodyJson = JSON.parse(String(first.init?.body)) as { variables?: { after?: string | null } };
    expect(bodyJson.variables?.after).toBe("page-2");
  });
});
