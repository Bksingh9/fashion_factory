/**
 * POST /api/stripe/checkout — start a Checkout Session for an authed user.
 *
 * Body: { plan: "pro" | "studio" | "agency" }
 * Returns: { url: string } with the hosted Checkout URL, or 401/400 on error.
 * Sets `client_reference_id` to the Supabase user.id so the webhook can map
 * the resulting subscription back to a profile.
 */
import { z } from "zod";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";
import { supabaseServer } from "@/server/db/server";
import { loadPlanMap, stripeClient } from "@/server/payments/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  plan: z.enum(["pro", "studio", "agency"]),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user === null) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const raw = (await req.json()) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { data: profile } = await sb
    .from("profiles")
    .select("stripe_customer_id, email")
    .eq("id", user.id)
    .maybeSingle();

  const map = loadPlanMap();
  const entry = map[parsed.data.plan];

  const session = await stripeClient().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: entry.priceId, quantity: 1 }],
    client_reference_id: user.id,
    ...(profile?.stripe_customer_id !== undefined && profile.stripe_customer_id !== null
      ? { customer: profile.stripe_customer_id }
      : { customer_email: profile?.email ?? user.email ?? undefined }),
    success_url: `${env.NEXT_PUBLIC_APP_URL}/billing?status=success`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}/billing?status=cancelled`,
    allow_promotion_codes: true,
    subscription_data: { metadata: { plan: parsed.data.plan, user_id: user.id } },
  });

  if (session.url === null) {
    return NextResponse.json({ error: "Stripe returned no checkout URL" }, { status: 500 });
  }
  return NextResponse.json({ url: session.url });
}
