import { beforeEach, describe, expect, it } from "vitest";
import { getPrompt, resetStubPrompts, setStubPrompt } from "@/server/llm/prompts";

beforeEach(() => {
  resetStubPrompts();
});

describe("prompts registry", () => {
  it("returns the seeded active v1 for a known name", async () => {
    const p = await getPrompt("extract.signals");
    expect(p.version).toBe("v1");
    expect(p.body).toContain("TBD");
  });

  it("switches the active version when the stub is overridden", async () => {
    setStubPrompt("test.prompt", {
      name: "test.prompt",
      version: "v1",
      body: "first body",
      schemaJson: null,
    });
    let p = await getPrompt("test.prompt");
    expect(p.body).toBe("first body");

    setStubPrompt("test.prompt", {
      name: "test.prompt",
      version: "v2",
      body: "second body",
      schemaJson: null,
    });
    p = await getPrompt("test.prompt");
    expect(p.body).toBe("second body");
    expect(p.version).toBe("v2");
  });
});
