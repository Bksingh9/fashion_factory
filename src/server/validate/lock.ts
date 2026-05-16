/**
 * Spec lock semantics.
 *
 * A spec is `lockable` when every one of the 6 section JSONB columns
 * holds a non-null object. `lockSpec` writes status='locked' +
 * locked_at; `unlockSpec` reverses (only if not already shipped — Phase
 * 4 will add the ship-runs reference check). Both write a `spec_events`
 * row capturing the transition.
 *
 * `isLockable` is pure — drives the verify-phase-3 unit check and the
 * UI's "Lock" button disabled state.
 */
import { supabaseService } from "@/server/db/service";

export type SectionsMap = {
  audience: unknown;
  competitors: unknown;
  wtp: unknown;
  pricing: unknown;
  features: unknown;
  gtm: unknown;
};

/**
 * Pure: every section must hold a non-null, non-empty object.
 *
 * (zod validation happens earlier in the pipeline; lock-time check is a
 * cheap nullability gate, deliberately not re-running the schemas.)
 */
export function isLockable(sections: Partial<SectionsMap>): boolean {
  const keys: (keyof SectionsMap)[] = [
    "audience",
    "competitors",
    "wtp",
    "pricing",
    "features",
    "gtm",
  ];
  for (const k of keys) {
    const v = sections[k];
    if (v === null || v === undefined) return false;
    if (typeof v !== "object") return false;
    if (Array.isArray(v) && v.length === 0) return false;
    if (Object.keys(v as Record<string, unknown>).length === 0) return false;
  }
  return true;
}

export interface LockResult {
  ok: boolean;
  status: "locked" | "draft";
  reason?: string;
}

/**
 * Transition a spec from `draft` → `locked`. Uses the service-role client
 * so it can write `spec_events` even though the user invoked it from a
 * non-admin path; the supplied `userId` MUST match `specs.user_id` —
 * checked explicitly to defend against confused-deputy edits.
 */
export async function lockSpec(specId: string, userId: string): Promise<LockResult> {
  const sb = supabaseService();
  const { data: spec, error: readErr } = await sb
    .from("specs")
    .select("user_id, status, audience, competitors, wtp, pricing, features, gtm")
    .eq("id", specId)
    .maybeSingle();
  if (readErr !== null) {
    return { ok: false, status: "draft", reason: `read: ${readErr.message}` };
  }
  if (spec === null) {
    return { ok: false, status: "draft", reason: "spec not found" };
  }
  if (spec.user_id !== userId) {
    return { ok: false, status: "draft", reason: "not owner" };
  }
  if (spec.status === "locked") {
    return { ok: true, status: "locked" };
  }
  if (!isLockable(spec)) {
    return { ok: false, status: "draft", reason: "one or more sections missing" };
  }

  const now = new Date().toISOString();
  const { error: updErr } = await sb
    .from("specs")
    .update({ status: "locked", locked_at: now })
    .eq("id", specId);
  if (updErr !== null) {
    return { ok: false, status: "draft", reason: `update: ${updErr.message}` };
  }

  // Append the lock event. Failure here logs but doesn't roll back — the
  // DB state is the source of truth; spec_events is audit.
  const { error: evtErr } = await sb.from("spec_events").insert({
    spec_id: specId,
    kind: "locked",
    payload: { user_id: userId },
  });
  if (evtErr !== null) {
    console.error(`[validate.lock] spec_events write failed: ${evtErr.message}`);
  }
  return { ok: true, status: "locked" };
}

export async function unlockSpec(specId: string, userId: string): Promise<LockResult> {
  const sb = supabaseService();
  const { data: spec, error: readErr } = await sb
    .from("specs")
    .select("user_id, status")
    .eq("id", specId)
    .maybeSingle();
  if (readErr !== null) {
    return { ok: false, status: "draft", reason: `read: ${readErr.message}` };
  }
  if (spec === null) {
    return { ok: false, status: "draft", reason: "spec not found" };
  }
  if (spec.user_id !== userId) {
    return { ok: false, status: "draft", reason: "not owner" };
  }
  if (spec.status === "draft") {
    return { ok: true, status: "draft" };
  }

  const { error: updErr } = await sb
    .from("specs")
    .update({ status: "draft", locked_at: null })
    .eq("id", specId);
  if (updErr !== null) {
    return { ok: false, status: "locked", reason: `update: ${updErr.message}` };
  }
  const { error: evtErr } = await sb.from("spec_events").insert({
    spec_id: specId,
    kind: "unlocked",
    payload: { user_id: userId },
  });
  if (evtErr !== null) {
    console.error(`[validate.lock] spec_events write failed: ${evtErr.message}`);
  }
  return { ok: true, status: "draft" };
}
