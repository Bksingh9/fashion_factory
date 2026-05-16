/**
 * POST /api/ship/start — enqueue a ship.run.
 *
 * Body: { spec_id: uuid, installation_id?: number, repo_name?: string }
 * Returns: { run_queued: true } 202 on success.
 *
 * Preconditions: caller must be authenticated, own the spec, the spec
 * must be `locked`, and either provide an installation_id OR have a
 * github_installations row.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { inngest } from "@/server/inngest/client";
import { supabaseServer } from "@/server/db/server";
import { supabaseService } from "@/server/db/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  spec_id: z.string().uuid(),
  installation_id: z.number().int().positive().optional(),
  repo_name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/).optional(),
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

  const svc = supabaseService();
  const { data: spec } = await svc
    .from("specs")
    .select("user_id, status")
    .eq("id", parsed.data.spec_id)
    .maybeSingle();
  if (spec === null || spec === undefined) {
    return NextResponse.json({ error: "spec not found" }, { status: 404 });
  }
  if (spec.user_id !== user.id) {
    return NextResponse.json({ error: "not owner" }, { status: 403 });
  }
  if (spec.status !== "locked") {
    return NextResponse.json({ error: "spec is not locked" }, { status: 409 });
  }

  // Resolve installation_id from body or from the user's github_installations row.
  let installationId = parsed.data.installation_id;
  if (installationId === undefined) {
    const { data: inst } = await svc
      .from("github_installations")
      .select("installation_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (inst === null || inst === undefined) {
      return NextResponse.json(
        { error: "no GitHub App installation; visit /app/github/install" },
        { status: 412 },
      );
    }
    installationId = inst.installation_id;
  }

  await inngest.send({
    name: "ship.requested",
    data: {
      spec_id: parsed.data.spec_id,
      installation_id: installationId,
      owner_login: user.email?.split("@")[0] ?? "painpilot-user",
      repo_name: parsed.data.repo_name,
    },
  });

  return NextResponse.json({ run_queued: true }, { status: 202 });
}
