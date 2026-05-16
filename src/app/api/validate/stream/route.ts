/**
 * POST /api/validate/stream — stream a single section's generation as SSE.
 *
 * Body: { spec_id: uuid, section: SectionKind }
 * Returns: text/event-stream of `data: <chunk>` lines, terminated with
 * `data: [DONE]`.
 *
 * Rate-limited via `limitLlm` (per-plan daily cap; calls counted here).
 * Ownership enforced inside `streamSection` (rejects if spec.user_id ≠
 * caller).
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/server/db/server";
import { supabaseService } from "@/server/db/service";
import { limitLlm } from "@/server/ratelimit";
import { streamSection } from "@/server/validate/stream";
import { SECTION_ORDER } from "@/server/validate/pipeline";
import type { Plan } from "@/types/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  spec_id: z.string().uuid(),
  section: z.enum(SECTION_ORDER),
});

export async function POST(req: NextRequest): Promise<NextResponse | Response> {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user === null) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  // Lookup the caller's plan for the LLM rate-limit bucket.
  const svc = supabaseService();
  const { data: profile } = await svc
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();
  const plan: Plan = profile?.plan ?? "free";

  const limit = await limitLlm(user.id, plan);
  if (!limit.success) {
    return NextResponse.json(
      { error: "rate-limited", reset: limit.reset },
      { status: 429 },
    );
  }

  try {
    const stream = await streamSection({
      specId: parsed.data.spec_id,
      userId: user.id,
      kind: parsed.data.section,
    });
    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === "not owner" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
