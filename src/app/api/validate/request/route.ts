/**
 * POST /api/validate/request — enqueue a validate.generate run.
 *
 * Body: { cluster_id: uuid, sections?: SectionKind[] }
 * Returns: { spec_id, queued: true } 202 on success, 401 unauth, 400 bad body.
 *
 * Finds-or-creates the caller's `draft` spec for the cluster (versioned
 * by `(cluster_id, user_id, version)`), then fires `validate.requested`
 * to Inngest. The Inngest function does the heavy lifting.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { inngest } from "@/server/inngest/client";
import { supabaseServer } from "@/server/db/server";
import { supabaseService } from "@/server/db/service";
import { SECTION_ORDER } from "@/server/validate/pipeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  cluster_id: z.string().uuid(),
  sections: z.array(z.enum(SECTION_ORDER)).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
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

  // Find-or-create the user's draft spec for this cluster (version 1 for now;
  // Phase 4 will bump versions on re-validate-after-ship).
  const svc = supabaseService();
  const { data: existing } = await svc
    .from("specs")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("cluster_id", parsed.data.cluster_id)
    .eq("version", 1)
    .maybeSingle();

  let specId: string;
  if (existing !== null && existing !== undefined) {
    if (existing.status === "locked") {
      return NextResponse.json(
        { error: "spec is locked; unlock before re-generating" },
        { status: 409 },
      );
    }
    specId = existing.id;
  } else {
    const { data: created, error: createErr } = await svc
      .from("specs")
      .insert({ user_id: user.id, cluster_id: parsed.data.cluster_id })
      .select("id")
      .single();
    if (createErr !== null) {
      return NextResponse.json({ error: createErr.message }, { status: 500 });
    }
    specId = created.id;
  }

  await inngest.send({
    name: "validate.requested",
    data: {
      spec_id: specId,
      sections: parsed.data.sections,
      user_id: user.id,
    },
  });

  return NextResponse.json({ spec_id: specId, queued: true }, { status: 202 });
}
