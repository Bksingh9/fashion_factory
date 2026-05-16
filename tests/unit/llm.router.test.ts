import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { llm, stubTraceLog, resetStubTraces } from "@/server/llm/router";
import { configureStub, resetStub } from "@/server/llm/providers/stub";
import { resetStubCache, stubCacheKeys } from "@/server/llm/cache";
import { resetStubRegistry, setStubActiveModel } from "@/server/llm/registry";

beforeEach(() => {
  resetStub();
  resetStubCache();
  resetStubTraces();
  resetStubRegistry();
});

describe("llm.router cache", () => {
  it("returns cached=false on first call and cached=true on identical second call", async () => {
    const call = {
      purpose: "test.cache",
      messages: [{ role: "user" as const, content: "hello-cache" }],
    };
    const a = await llm.hot(call);
    expect(a.cached).toBe(false);
    expect(stubCacheKeys().length).toBe(1);

    const b = await llm.hot(call);
    expect(b.cached).toBe(true);
  });
});

describe("llm.router schema retry", () => {
  it("retries once when the first reply is invalid JSON", async () => {
    configureStub("groq", "bad-json-once");
    const schema = z.object({ stub: z.boolean(), provider: z.string(), model: z.string(), echo: z.string() });
    const result = await llm.hot({
      purpose: "test.schema",
      messages: [{ role: "user", content: "x" }],
      schema,
    });
    // After retry, the stub returns valid JSON the schema parses.
    expect(typeof result.data).toBe("object");
    // Both calls counted toward tokens.
    expect(result.tokensIn).toBeGreaterThan(0);
  });
});

describe("llm.router provider fallback", () => {
  it("walks the fallback chain when the primary is down", async () => {
    configureStub("groq", "down");
    const result = await llm.hot({
      purpose: "test.fallback",
      messages: [{ role: "user", content: "x" }],
    });
    expect(result.provider).toBe("openrouter");
  });
});

describe("llm.router retry on 429/5xx", () => {
  it("retries once on a 429 and then succeeds", async () => {
    configureStub("groq", "rate-limit-once");
    const result = await llm.hot({
      purpose: "test.retry",
      messages: [{ role: "user", content: "x" }],
    });
    // Stub returns valid output on the second internal attempt.
    expect(result.provider).toBe("groq");
  });
});

describe("llm.router trace row", () => {
  it("writes a trace row with a non-null trace_id", async () => {
    await llm.hot({
      purpose: "test.trace",
      messages: [{ role: "user", content: "x" }],
      userId: "user-trace-1",
    });
    const log = stubTraceLog();
    expect(log.length).toBeGreaterThan(0);
    const first = log[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.traceId).toMatch(/^stub-/);
    expect(first.purpose).toBe("test.trace");
    expect(first.userId).toBe("user-trace-1");
  });
});

describe("llm.router registry switching", () => {
  it("uses the new active model after setStubActiveModel", async () => {
    setStubActiveModel("hot", {
      id: "test-override",
      provider: "groq",
      model: "test-model-xyz",
      kind: "hot",
      inputPer1m: 1,
      outputPer1m: 1,
      contextWindow: 4096,
      supportsJson: true,
      supportsTools: false,
      supportsVision: false,
      supportsCaching: false,
    });
    const result = await llm.hot({
      purpose: "test.registry",
      messages: [{ role: "user", content: "x" }],
    });
    expect(result.model).toBe("test-model-xyz");
  });
});

describe("llm.embed + llm.rerank", () => {
  it("embed returns a vector array", async () => {
    const result = await llm.embed({ input: ["alpha", "beta"], purpose: "test.embed" });
    expect(result.embeddings.length).toBe(2);
    const first = result.embeddings[0];
    expect(first).toBeDefined();
    if (first !== undefined) expect(first.length).toBe(8);
  });

  it("rerank returns sorted results", async () => {
    const result = await llm.rerank({
      query: "q",
      documents: ["a", "b", "c"],
      purpose: "test.rerank",
    });
    expect(result.results.length).toBe(3);
    const [first, second] = [result.results[0], result.results[1]];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first !== undefined && second !== undefined) {
      expect(first.score).toBeGreaterThanOrEqual(second.score);
    }
  });
});
