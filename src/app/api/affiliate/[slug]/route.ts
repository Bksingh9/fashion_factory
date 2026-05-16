/**
 * GET /api/affiliate/[slug] — 302 redirect + log click.
 *
 * Honors the affiliate's `active` flag; 404s if absent. Click row is
 * inserted server-side via the service-role client (RLS denies anon
 * writes). IP + UA are SHA-256 hashed before insert.
 */
import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseService } from "@/server/db/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function hash(input: string | null): string | null {
  if (input === null || input.length === 0) return null;
  return createHash("sha256").update(input).digest("hex").slice(0, 32);
}

type Params = Promise<{ slug: string }>;

export async function GET(
  req: NextRequest,
  ctx: { params: Params },
): Promise<NextResponse> {
  const { slug } = await ctx.params;
  const sb = supabaseService();
  const { data: affiliate } = await sb
    .from("affiliates")
    .select("id, target_url, active")
    .eq("slug", slug)
    .maybeSingle();
  if (affiliate === null || !affiliate.active) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = req.headers.get("user-agent");
  const referrer = req.headers.get("referer");

  const { error } = await sb.from("affiliate_clicks").insert({
    affiliate_id: affiliate.id,
    ip_hash: hash(ip),
    ua_hash: hash(ua),
    referrer,
  });
  if (error !== null) {
    console.error(`[affiliate] click log failed: ${error.message}`);
  }

  return NextResponse.redirect(affiliate.target_url, { status: 302 });
}
