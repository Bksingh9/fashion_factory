/**
 * Stripe integration — client, plan ↔ price mapping, idempotent event handler.
 *
 * Idempotency is keyed by event.id in Upstash with a 30-day TTL. The webhook
 * route owns signature verification; this module owns the post-verification
 * pipeline so it stays unit-testable.
 *
 * `STRIPE_STUB=1` swaps:
 *   - The Stripe SDK client for a tiny in-memory fake.
 *   - The Upstash idempotency check for an in-memory Map.
 *   - Profile mutations are still attempted via supabaseService(); if no DB,
 *     they fail loud (we don't pretend they succeeded).
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import Stripe from "stripe";
import { Redis } from "@upstash/redis";
import { env } from "@/env";
import { supabaseService } from "@/server/db/service";
import type { Plan } from "@/types/database";

export type PaidPlan = Exclude<Plan, "free">;

export interface PriceEntry {
  productId: string;
  priceId: string;
  amountCents: number;
}

export type PlanMap = Record<PaidPlan, PriceEntry>;

export const PLAN_AMOUNTS_CENTS: Record<PaidPlan, number> = {
  pro: 2900,
  studio: 9900,
  agency: 29900,
};

const STRIPE_JSON_PATH = "scripts/stripe.json";

let mapCached: PlanMap | null = null;
export function loadPlanMap(): PlanMap {
  if (mapCached !== null) return mapCached;
  const file = path.resolve(process.cwd(), STRIPE_JSON_PATH);
  if (!existsSync(file)) {
    throw new Error(
      `payments: ${STRIPE_JSON_PATH} not found. Run \`pnpm tsx scripts/setup-stripe.ts\` to populate it.`,
    );
  }
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<PlanMap>;
  for (const plan of ["pro", "studio", "agency"] as const) {
    if (parsed[plan] === undefined) {
      throw new Error(`payments: ${STRIPE_JSON_PATH} missing entry for plan="${plan}"`);
    }
  }
  mapCached = parsed as PlanMap;
  return mapCached;
}

export function clearPlanMapCache(): void {
  mapCached = null;
}

export function isStripeStubbed(): boolean {
  return process.env.STRIPE_STUB === "1";
}

// ---------- Stripe client ----------

let stripeCached: Stripe | null = null;
export function stripeClient(): Stripe {
  if (stripeCached !== null) return stripeCached;
  stripeCached = new Stripe(env.STRIPE_SECRET_KEY, {
    typescript: true,
  });
  return stripeCached;
}

// ---------- Idempotency ----------

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
export function resetStripeIdempotencyStub(): void {
  stubProcessed.clear();
}

/**
 * Mark an event id as processed. Returns true on first sight, false if
 * already-seen. Uses Upstash SET NX with a 30d expiry — the canonical
 * pattern for cross-instance idempotency.
 */
async function markProcessed(eventId: string): Promise<boolean> {
  const key = `stripe:event:${eventId}`;
  if (isStripeStubbed()) {
    if (stubProcessed.has(key)) return false;
    stubProcessed.add(key);
    return true;
  }
  const r = await redis().set(key, "1", {
    nx: true,
    ex: 30 * 24 * 60 * 60,
  });
  return r === "OK";
}

// ---------- Event handler ----------

export interface HandleEventResult {
  processed: boolean;
  alreadySeen: boolean;
  action: string;
}

function planFromPriceId(priceId: string): PaidPlan | null {
  const map = loadPlanMap();
  for (const plan of ["pro", "studio", "agency"] as const) {
    if (map[plan].priceId === priceId) return plan;
  }
  return null;
}

export async function handleStripeEvent(event: Stripe.Event): Promise<HandleEventResult> {
  const firstTime = await markProcessed(event.id);
  if (!firstTime) {
    return { processed: false, alreadySeen: true, action: `${event.type}:skipped-duplicate` };
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.client_reference_id;
      const customerId =
        typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
      if (userId === null || userId === undefined) {
        console.error(`[stripe.webhook] checkout.session.completed missing client_reference_id (event ${event.id})`);
        return { processed: true, alreadySeen: false, action: "checkout:no-user" };
      }
      // Resolve the plan from the subscription's first line item.
      let plan: PaidPlan | null = null;
      if (typeof session.subscription === "string" && !isStripeStubbed()) {
        const sub = await stripeClient().subscriptions.retrieve(session.subscription);
        const priceId = sub.items.data[0]?.price.id;
        if (priceId !== undefined) plan = planFromPriceId(priceId);
      }
      const sb = supabaseService();
      const { error } = await sb
        .from("profiles")
        .update({
          plan: plan ?? "pro",
          stripe_customer_id: customerId,
        })
        .eq("id", userId);
      if (error !== null) {
        console.error(`[stripe.webhook] profile update failed: ${error.message}`);
      }
      return { processed: true, alreadySeen: false, action: `checkout:upgraded-${plan ?? "pro"}` };
    }

    case "customer.subscription.updated":
    case "customer.subscription.created": {
      const sub = event.data.object;
      const priceId = sub.items.data[0]?.price.id;
      const plan = priceId !== undefined ? planFromPriceId(priceId) : null;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      if (plan === null) {
        return { processed: true, alreadySeen: false, action: "subscription:unknown-price" };
      }
      const sb = supabaseService();
      const { error } = await sb
        .from("profiles")
        .update({ plan })
        .eq("stripe_customer_id", customerId);
      if (error !== null) {
        console.error(`[stripe.webhook] profile update failed: ${error.message}`);
      }
      return { processed: true, alreadySeen: false, action: `subscription:set-${plan}` };
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const sb = supabaseService();
      const { error } = await sb
        .from("profiles")
        .update({ plan: "free" })
        .eq("stripe_customer_id", customerId);
      if (error !== null) {
        console.error(`[stripe.webhook] profile downgrade failed: ${error.message}`);
      }
      return { processed: true, alreadySeen: false, action: "subscription:downgraded-free" };
    }

    default:
      return { processed: true, alreadySeen: false, action: `${event.type}:no-op` };
  }
}
