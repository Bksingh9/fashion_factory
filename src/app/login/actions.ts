"use server";

/**
 * Auth server actions.
 *
 * Both magic-link and Google OAuth flow through the Supabase server client.
 * On success, the user is redirected back to /auth/callback, which finishes
 * the session exchange and lands them on /app (or `next=` param).
 */
import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/env";
import { supabaseServer } from "@/server/db/server";

const emailSchema = z.string().email();

export async function magicLinkAction(formData: FormData): Promise<void> {
  const raw = formData.get("email");
  const next = formData.get("next");
  const nextPath = typeof next === "string" && next.startsWith("/") ? next : "/app";

  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`/login?error=${encodeURIComponent("Enter a valid email address.")}`);
  }

  const sb = await supabaseServer();
  const redirectTo = new URL("/auth/callback", env.NEXT_PUBLIC_APP_URL);
  redirectTo.searchParams.set("next", nextPath);

  const { error } = await sb.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: redirectTo.toString() },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect(`/login?sent=1&email=${encodeURIComponent(parsed.data)}`);
}

export async function googleOauthAction(formData: FormData): Promise<void> {
  const next = formData.get("next");
  const nextPath = typeof next === "string" && next.startsWith("/") ? next : "/app";

  const sb = await supabaseServer();
  const redirectTo = new URL("/auth/callback", env.NEXT_PUBLIC_APP_URL);
  redirectTo.searchParams.set("next", nextPath);

  const { data, error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectTo.toString() },
  });

  if (error || data.url === null || data.url === undefined) {
    redirect(`/login?error=${encodeURIComponent(error?.message ?? "Google sign-in failed")}`);
  }
  redirect(data.url);
}

export async function signOutAction(): Promise<void> {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/login");
}
