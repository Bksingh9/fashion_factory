/**
 * Polar integration — webhook verification + idempotent event handler.
 *
 * Mirrors the Stripe webhook pattern: HMAC verify the raw body, then a
 * pure `handlePolarEvent(event)` that's unit-testable without real Polar.
 *
 * Idempotency keyed by `polar_event_id` via Upstash SET NX with a 30d
 * TTL — same convention as Stripe. POLAR_STUB=1 swaps to in-memory.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { Redis } from "@upstash/redis";
import { env } from "@/env";
import { supabaseService } from "@/server/db/service";

export function isPolarStubbed(): boolean {
  return process.env.POLAR_STUB === "1";
}

let redisCached: Redis | null = null;
function redis(): Redis {
  if (redisCached !== null) return redisCached;
  redisCached = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return redisCached;
}

const stubProcessed = new Set<string>();
export function resetPolarIdempotencyStub(): void {
  stubProcessed.clear();
}

async function markProcessed(eventId: string): Promise<boolean> {
  const key = `polar:event:${eventId}`;
  if (isPolarStubbed()) {
    if (stubProcessed.has(key)) return false;
    stubProcessed.add(key);
    return true;
  }
  const r = await redis().set(key, "1", { nx: true, ex: 30 * 24 * 60 * 60 });
  return r === "OK";
}

/**
 * Verify Polar's webhook signature. Polar uses HMAC-SHA256 over the raw
 * body with the configured secret; signature is base64.
 */
export function verifyPolarSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (signature === null) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export interface PolarEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface HandleResult {
  processed: boolean;
  alreadySeen: boolean;
  action: string;
}

/**
 * Pure handler invoked by the webhook route after signature verification.
 * Idempotent on `event.id`. Writes a `product_events` row + dispatches
 * by event.type. Mirrors `handleStripeEvent` (src/server/payments/stripe.ts).
 */
export async function handlePolarEvent(event: PolarEvent): Promise<HandleResult> {
  const first = await markProcessed(event.id);
  if (!first) {
    return { processed: false, alreadySeen: true, action: `${event.type}:skipped-duplicate` };
  }

  // Resolve the product_id from event.data.product.id (most Polar events carry it).
  const productId = (event.data["product_id"] ?? null) as string | null;
  if (productId !== null) {
    const sb = supabaseService();
    const { error } = await sb.from("product_events").insert({
      product_id: productId,
      kind: event.type,
      payload: event.data as Record<string, never>,
      polar_event_id: event.id,
    });
    if (error !== null) {
      console.error(`[polar] product_events insert: ${error.message}`);
    }
  }

  switch (event.type) {
    case "subscription.created":
    case "subscription.updated":
    case "subscription.canceled":
      // Phase 5 just records — Phase 6+ pipes derived metrics.
      return { processed: true, alreadySeen: false, action: `${event.type}:recorded` };
    default:
      return { processed: true, alreadySeen: false, action: `${event.type}:no-op` };
  }
}
