"use server";

/**
 * Server actions for the /app surface.
 *
 * `toggleSaveAction(clusterId)` flips the user's `cluster_saves` row for
 * the given cluster. Used by the Save button on every cluster card to
 * mark / unmark a cluster for §9's 90-day-author-purge exemption.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServer } from "@/server/db/server";

const idSchema = z.string().uuid();

export async function toggleSaveAction(clusterId: string): Promise<{ saved: boolean }> {
  const parsed = idSchema.safeParse(clusterId);
  if (!parsed.success) throw new Error("invalid cluster id");

  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user === null) throw new Error("unauthenticated");

  // Probe the existing save (RLS scopes this to the calling user).
  const { data: existing } = await sb
    .from("cluster_saves")
    .select("user_id")
    .eq("cluster_id", parsed.data)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing !== null && existing !== undefined) {
    const { error } = await sb
      .from("cluster_saves")
      .delete()
      .eq("cluster_id", parsed.data)
      .eq("user_id", user.id);
    if (error !== null) throw new Error(`cluster_saves delete: ${error.message}`);
    revalidatePath("/app");
    revalidatePath("/app/saved");
    return { saved: false };
  }

  const { error } = await sb
    .from("cluster_saves")
    .insert({ cluster_id: parsed.data, user_id: user.id });
  if (error !== null) throw new Error(`cluster_saves insert: ${error.message}`);
  revalidatePath("/app");
  revalidatePath("/app/saved");
  return { saved: true };
}
