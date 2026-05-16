/**
 * POST /api/stripe/portal — open the Stripe Billing Portal for the authed user.
 *
 * Returns { url } with the portal session URL. The Billing page POSTs here
 * and redirects the browser. 404s if the user has no stripe_customer_id yet.
 */
import { NextResponse } from "next/server";
import { env } from "@/env";
import { supabaseServer } from "@/server/db/server";
import { stripeClient } from "@/server/payments/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user === null) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data: profile } = await sb
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.stripe_customer_id === null || profile?.stripe_customer_id === undefined) {
    return NextResponse.json(
      { error: "no Stripe customer for this user — subscribe first" },
      { status: 404 },
    );
  }

  const session = await stripeClient().billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${env.NEXT_PUBLIC_APP_URL}/billing`,
  });
  return NextResponse.json({ url: session.url });
}
