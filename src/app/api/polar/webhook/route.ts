/**
 * POST /api/polar/webhook — Polar webhook intake.
 *
 * Verifies the `polar-signature` header (HMAC-SHA256 base64 over raw
 * body) with POLAR_WEBHOOK_SECRET; dispatches the parsed event into
 * Inngest as `polar.event.received`. The Inngest function does the
 * idempotency check (so a re-delivery from Polar doesn't double-write).
 */
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";
import { inngest } from "@/server/inngest/client";
import { verifyPolarSignature } from "@/server/payments/polar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PolarEventPayload {
  id?: string;
  type?: string;
  data?: Record<string, unknown>;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const signature = req.headers.get("polar-signature");
  const raw = await req.text();
  if (!verifyPolarSignature(raw, signature, env.POLAR_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let payload: PolarEventPayload;
  try {
    payload = JSON.parse(raw) as PolarEventPayload;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (
    typeof payload.id !== "string" ||
    typeof payload.type !== "string" ||
    typeof payload.data !== "object" ||
    payload.data === null
  ) {
    return NextResponse.json({ error: "malformed event payload" }, { status: 400 });
  }

  await inngest.send({
    name: "polar.event.received",
    data: { event: { id: payload.id, type: payload.type, data: payload.data } },
  });

  return NextResponse.json({ received: true });
}
