import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  handlePolarEvent,
  resetPolarIdempotencyStub,
  verifyPolarSignature,
  type PolarEvent,
} from "@/server/payments/polar";

const SECRET = "polar-test-secret";

function sign(body: string): string {
  return createHmac("sha256", SECRET).update(body).digest("base64");
}

beforeEach(() => {
  resetPolarIdempotencyStub();
});

describe("verifyPolarSignature", () => {
  it("accepts a correctly-signed body", () => {
    const body = JSON.stringify({ id: "evt_x", type: "subscription.created", data: {} });
    expect(verifyPolarSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects when signature is null", () => {
    expect(verifyPolarSignature("body", null, SECRET)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify({ id: "evt_x" });
    expect(verifyPolarSignature(JSON.stringify({ id: "evt_y" }), sign(body), SECRET)).toBe(false);
  });

  it("rejects the wrong secret", () => {
    const body = "body";
    expect(verifyPolarSignature(body, sign(body), "wrong")).toBe(false);
  });
});

describe("handlePolarEvent idempotency", () => {
  function evt(id: string, type: string): PolarEvent {
    return { id, type, data: { product_id: "00000000-0000-0000-0000-000000000001" } };
  }

  it("processes the first occurrence and skips duplicates", async () => {
    const a = await handlePolarEvent(evt("evt_idempotent_1", "subscription.created"));
    expect(a.alreadySeen).toBe(false);
    const b = await handlePolarEvent(evt("evt_idempotent_1", "subscription.created"));
    expect(b.alreadySeen).toBe(true);
    expect(b.action).toContain("skipped-duplicate");
  });

  it("distinct event ids are processed independently", async () => {
    const a = await handlePolarEvent(evt("evt_a", "subscription.created"));
    const b = await handlePolarEvent(evt("evt_b", "subscription.canceled"));
    expect(a.alreadySeen).toBe(false);
    expect(b.alreadySeen).toBe(false);
  });
});
