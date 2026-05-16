/**
 * POST /api/stripe/webhook — Stripe-verified webhook entry point.
 *
 * Pipeline:
 *   1. Read raw body (must be unparsed for signature verification).
 *   2. Verify the `stripe-signature` header with STRIPE_WEBHOOK_SECRET.
 *   3. Hand the parsed Stripe.Event off to handleStripeEvent() — which is
 *      idempotent on event.id via Upstash (30d TTL).
 *
 * Stripe expects a 2xx response on success, even if we skip a duplicate.
 */
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";
import { handleStripeEvent, stripeClient } from "@/server/payments/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sig = req.headers.get("stripe-signature");
  if (sig === null) {
    return NextResponse.json({ error: "missing stripe-signature header" }, { status: 400 });
  }
  const payload = await req.text();

  let event;
  try {
    event = stripeClient().webhooks.constructEvent(payload, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `invalid signature: ${msg}` }, { status: 400 });
  }

  try {
    const result = await handleStripeEvent(event);
    return NextResponse.json({ received: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[stripe.webhook] handler error for ${event.id} (${event.type}): ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
