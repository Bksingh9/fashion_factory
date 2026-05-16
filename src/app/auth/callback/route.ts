/**
 * /auth/callback — finishes the Supabase magic-link / OAuth exchange.
 *
 * On magic-link or Google OAuth, Supabase redirects the user here with a
 * `code` query param. We exchange that for a session (writes auth cookies
 * via the @supabase/ssr server client) and then bounce to `next` (or /app).
 */
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/server/db/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const errParam = url.searchParams.get("error");
  const errDesc = url.searchParams.get("error_description");
  const nextParam = url.searchParams.get("next");
  const next = nextParam !== null && nextParam.startsWith("/") ? nextParam : "/app";

  if (errParam !== null) {
    const back = new URL("/login", req.url);
    back.searchParams.set("error", errDesc ?? errParam);
    return NextResponse.redirect(back);
  }

  if (code === null) {
    const back = new URL("/login", req.url);
    back.searchParams.set("error", "Missing auth code");
    return NextResponse.redirect(back);
  }

  const sb = await supabaseServer();
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error !== null) {
    const back = new URL("/login", req.url);
    back.searchParams.set("error", error.message);
    return NextResponse.redirect(back);
  }

  return NextResponse.redirect(new URL(next, req.url));
}
