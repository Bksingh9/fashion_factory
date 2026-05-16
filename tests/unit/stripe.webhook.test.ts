import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import Stripe from "stripe";
import {
  handleStripeEvent,
  resetStripeIdempotencyStub,
  stripeClient,
} from "@/server/payments/stripe";
import { env } from "@/env";

function signedPayload(json: string, secret: string): { payload: string; sig: string } {
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secret)
    .update(`${String(ts)}.${json}`)
    .digest("hex");
  return { payload: json, sig: `t=${String(ts)},v1=${sig}` };
}

function makeDeletedSubEvent(id: string, customer: string): Stripe.Event {
  const json = JSON.stringify({
    id,
    object: "event",
    api_version: "2024-12-18.acacia",
    created: Math.floor(Date.now() / 1000),
    type: "customer.subscription.deleted",
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: "sub_test",
        object: "subscription",
        customer,
        items: { object: "list", data: [], has_more: false, url: "/v1/subscription_items" },
        status: "canceled",
      },
    },
  });
  const { payload, sig } = signedPayload(json, env.STRIPE_WEBHOOK_SECRET);
  // constructEvent returns Stripe.Event — no `as` cast needed.
  return stripeClient().webhooks.constructEvent(payload, sig, env.STRIPE_WEBHOOK_SECRET);
}

beforeEach(() => {
  resetStripeIdempotencyStub();
});

describe("handleStripeEvent idempotency", () => {
  it("processes the first occurrence and skips the duplicate", async () => {
    const evt = makeDeletedSubEvent("evt_idempotent_1", "cus_test_42");

    const first = await handleStripeEvent(evt);
    expect(first.alreadySeen).toBe(false);

    const second = await handleStripeEvent(evt);
    expect(second.alreadySeen).toBe(true);
    expect(second.processed).toBe(false);
    expect(second.action).toContain("skipped-duplicate");
  });

  it("treats different event ids as distinct", async () => {
    const e1 = makeDeletedSubEvent("evt_unique_a", "cus_aaa");
    const e2 = makeDeletedSubEvent("evt_unique_b", "cus_bbb");
    const r1 = await handleStripeEvent(e1);
    const r2 = await handleStripeEvent(e2);
    expect(r1.alreadySeen).toBe(false);
    expect(r2.alreadySeen).toBe(false);
  });
});
