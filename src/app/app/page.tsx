import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SignalFeed, type FeedCluster } from "@/components/signal-feed";
import { supabaseServer } from "@/server/db/server";
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
  if (user === null) {
    redirect("/login?next=/app");
  }

  const [profileRes, clustersRes] = await Promise.all([
    sb.from("profiles").select("email, full_name, handle, plan").eq("id", user.id).maybeSingle(),
    sb
      .from("clusters")
      .select("id, title, summary, pain_score, audience, keywords, member_count, last_signal_at")
      .order("last_signal_at", { ascending: false })
      .limit(20),
  ]);
  const profile = profileRes.data;
  const clusterRows = clustersRes.data ?? [];

  // Client-side "join" against cluster_saves keeps the typed query builder
  // happy without declaring the FK relationship in the hand-maintained
  // Database type. Two roundtrips, second is a pk lookup — well under budget.
  const clusterIds = clusterRows.map((c) => c.id);
  let savedIds = new Set<string>();
  if (clusterIds.length > 0) {
    const { data: saves } = await sb
      .from("cluster_saves")
      .select("cluster_id")
      .eq("user_id", user.id)
      .in("cluster_id", clusterIds);
    savedIds = new Set((saves ?? []).map((s) => s.cluster_id));
  }

  const plan: Plan = profile?.plan ?? "free";
  const displayName = profile?.full_name ?? profile?.handle ?? user.email ?? "there";

  const feedClusters: FeedCluster[] = clusterRows.map((c) => ({
    id: c.id,
    title: c.title,
    summary: c.summary,
    pain_score: c.pain_score,
    audience: c.audience,
    keywords: c.keywords,
    member_count: c.member_count,
    last_signal_at: c.last_signal_at,
    saved_by_me: savedIds.has(c.id),
  }));

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome, {displayName}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Live demand clusters from your enabled sources. Save the ones worth shipping.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" data-testid="plan-badge">
            {planLabel[plan]}
          </Badge>
          <Link href="/app/saved" className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400">
            Saved
          </Link>
        </div>
      </header>

      <SignalFeed clusters={feedClusters} />

      <form action={signOutAction} className="self-start">
        <Button type="submit" variant="outline" size="sm">
          Sign out
        </Button>
      </form>
    </main>
  );
}
