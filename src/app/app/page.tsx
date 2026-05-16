import { redirect } from "next/navigation";
import { supabaseServer } from "@/server/db/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { signOutAction } from "../login/actions";
import type { Plan } from "@/types/database";

export const dynamic = "force-dynamic";

const planLabel: Record<Plan, string> = {
  free: "Free plan",
  pro: "Pro plan",
  studio: "Studio plan",
  agency: "Agency plan",
};

export default async function AppHome(): Promise<React.ReactNode> {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();

  // Middleware should already have redirected; this is defense in depth.
  if (user === null) {
    redirect("/login?next=/app");
  }

  const { data: profile } = await sb
    .from("profiles")
    .select("email, full_name, handle, plan")
    .eq("id", user.id)
    .maybeSingle();

  const plan: Plan = profile?.plan ?? "free";
  const displayName = profile?.full_name ?? profile?.handle ?? user.email ?? "there";

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome, {displayName}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Your PainPilot workspace. Crawlers, signals, and ship pipelines land here in Phase 2+.
          </p>
        </div>
        <Badge variant="secondary" data-testid="plan-badge">
          {planLabel[plan]}
        </Badge>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p>
          Phase 1 spine is live — auth, DB, LLM router, billing, observability stubs. Visit{" "}
          <a className="underline" href="/billing">
            /billing
          </a>{" "}
          to manage your subscription.
        </p>
      </div>

      <form action={signOutAction}>
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </main>
  );
}
