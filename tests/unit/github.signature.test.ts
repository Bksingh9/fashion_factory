import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "@/server/github/app";

const SECRET = "whsec-test-1234";

function sign(body: string): string {
  return `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
}

describe("verifyWebhookSignature", () => {
  it("accepts a correctly-signed body", () => {
    const body = JSON.stringify({ action: "ping", id: 42 });
    expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects when the signature has the wrong prefix", () => {
    const body = "ok";
    expect(verifyWebhookSignature(body, "sha1=00", SECRET)).toBe(false);
  });

  it("rejects when the signature is null", () => {
    expect(verifyWebhookSignature("body", null, SECRET)).toBe(false);
  });

  it("rejects when the body has been tampered with", () => {
    const body = JSON.stringify({ action: "ping" });
    const tampered = JSON.stringify({ action: "evil" });
    expect(verifyWebhookSignature(tampered, sign(body), SECRET)).toBe(false);
  });

  it("rejects when the secret is wrong", () => {
    const body = "ok";
    expect(verifyWebhookSignature(body, sign(body), "wrong-secret")).toBe(false);
  });
});
