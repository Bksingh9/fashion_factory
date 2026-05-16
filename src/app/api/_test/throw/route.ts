/**
 * Test endpoint: deliberately throws so verify-phase-1 can assert that the
 * instrumentation hook (Sentry stub) captures it.
 *
 * Gated by NODE_ENV !== "production" so it never runs in production. If you
 * really need to reach it in production (chaos drill), set ALLOW_TEST_THROW=1.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(): NextResponse {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_TEST_THROW !== "1") {
    return NextResponse.json({ error: "disabled in production" }, { status: 403 });
  }
  throw new Error("PainPilot test throw — wired to Sentry/Axiom via instrumentation.ts");
}
