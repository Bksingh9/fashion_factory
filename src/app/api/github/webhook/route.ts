/**
 * POST /api/github/webhook — GitHub App webhook intake.
 *
 * Verifies `x-hub-signature-256` with GITHUB_APP_WEBHOOK_SECRET before
 * doing anything else. Forwards the event into Inngest as
 * `github.app.event` for downstream functions (Phase 4 wires the intake;
 * specific handlers like `ship.metrics_snapshot` consume in Phase 5+).
 */
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";
import { inngest } from "@/server/inngest/client";
import { verifyWebhookSignature } from "@/server/github/app";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const signature = req.headers.get("x-hub-signature-256");
  const eventName = req.headers.get("x-github-event") ?? "unknown";
  const rawBody = await req.text();

  if (!verifyWebhookSignature(rawBody, signature, env.GITHUB_APP_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  await inngest.send({
    name: "github.app.event",
    data: { event: eventName, payload },
  });

  return NextResponse.json({ received: true });
}
