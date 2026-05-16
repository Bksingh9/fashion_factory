"use server";

/**
 * Server actions for the /app/clusters/[id]/validate surface.
 *
 *   - editSectionAction(specId, section, payload)
 *       — merge an edit into the spec's section column. The Inngest
 *         pipeline writes via the service-role client; this path lets
 *         the founder hand-edit. Bumps `updated_at` via the trigger;
 *         the streaming UI re-reads after edits.
 *   - lockSpecAction(specId) / unlockSpecAction(specId)
 *       — wrappers around /src/server/validate/lock.ts, sourced from
 *         the authed Supabase context so ownership stays accurate.
 *
 * All actions call `revalidatePath` on the cluster's validate page so
 * the next RSC render picks up the change without manual refresh.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServer } from "@/server/db/server";
import { lockSpec, unlockSpec } from "@/server/validate/lock";
import { SECTION_ORDER } from "@/server/validate/pipeline";
import type { Json } from "@/types/database";

function asJson(value: unknown): Json {
  return value as Json;
}

const sectionEnum = z.enum(SECTION_ORDER);

export async function editSectionAction(
  specId: string,
  section: string,
  payload: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const sectionParsed = sectionEnum.safeParse(section);
  if (!sectionParsed.success) {
    return { ok: false, error: "invalid section name" };
  }
  if (payload === null || typeof payload !== "object") {
    return { ok: false, error: "payload must be a JSON object" };
  }

  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user === null) return { ok: false, error: "unauthenticated" };

  // Use the user-scoped client so RLS enforces ownership.
  const update: {
    audience?: Json;
    competitors?: Json;
    wtp?: Json;
    pricing?: Json;
    features?: Json;
    gtm?: Json;
  } =
    sectionParsed.data === "wtp_pricing"
      ? { wtp: asJson(payload), pricing: asJson(payload) }
      : { [sectionParsed.data]: asJson(payload) };

  const { error: updErr } = await sb
    .from("specs")
    .update(update)
    .eq("id", specId)
    .eq("user_id", user.id);
  if (updErr !== null) return { ok: false, error: updErr.message };

  // Audit row — best-effort; failure logs but doesn't surface to user.
  const { error: evtErr } = await sb.from("spec_events").insert({
    spec_id: specId,
    kind: "edited",
    section: sectionParsed.data,
    payload: asJson(payload),
  });
  if (evtErr !== null) {
    console.error(`[validate.actions] spec_events write failed: ${evtErr.message}`);
  }

  revalidatePath(`/app/clusters/${specId}/validate`);
  return { ok: true };
}

export async function lockSpecAction(specId: string): Promise<{ ok: boolean; error?: string }> {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user === null) return { ok: false, error: "unauthenticated" };

  const result = await lockSpec(specId, user.id);
  revalidatePath(`/app/clusters/${specId}/validate`);
  return result.ok ? { ok: true } : { ok: false, error: result.reason ?? "lock failed" };
}

export async function unlockSpecAction(specId: string): Promise<{ ok: boolean; error?: string }> {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user === null) return { ok: false, error: "unauthenticated" };

  const result = await unlockSpec(specId, user.id);
  revalidatePath(`/app/clusters/${specId}/validate`);
  return result.ok ? { ok: true } : { ok: false, error: result.reason ?? "unlock failed" };
}
