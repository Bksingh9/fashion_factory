import Link from "next/link";
import { redirect } from "next/navigation";
import { SignalFeed, type FeedCluster } from "@/components/signal-feed";
import { supabaseServer } from "@/server/db/server";

export const dynamic = "force-dynamic";

export default async function SavedClusters(): Promise<React.ReactNode> {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user === null) {
    redirect("/login?next=/app/saved");
  }

  // Two-step client-side join (same pattern as /app/page.tsx). Keeps the
  // typed query builder simple, no schema-Relationships declaration needed.
  const { data: saveRows } = await sb
    .from("cluster_saves")
    .select("cluster_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const savedClusterIds = (saveRows ?? []).map((s) => s.cluster_id);
  let clusterRows: {
    id: string;
    title: string | null;
    summary: string | null;
    pain_score: number | null;
    audience: string | null;
    keywords: string[] | null;
    member_count: number;
    last_signal_at: string;
  }[] = [];
  if (savedClusterIds.length > 0) {
    const { data: clusters } = await sb
      .from("clusters")
      .select("id, title, summary, pain_score, audience, keywords, member_count, last_signal_at")
      .in("id", savedClusterIds);
    clusterRows = clusters ?? [];
  }

  // Preserve save-order (newest save first).
  const orderById = new Map<string, number>();
  savedClusterIds.forEach((id, i) => orderById.set(id, i));
  clusterRows.sort((a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0));

  const feed: FeedCluster[] = clusterRows.map((c) => ({
    id: c.id,
    title: c.title,
    summary: c.summary,
    pain_score: c.pain_score,
    audience: c.audience,
    keywords: c.keywords,
    member_count: c.member_count,
    last_signal_at: c.last_signal_at,
    saved_by_me: true,
  }));

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Saved clusters</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Clusters you&apos;ve saved are exempt from the 90-day author-name purge (§9).
          </p>
        </div>
        <Link
          href="/app"
          className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
        >
          ← All clusters
        </Link>
      </header>

      <SignalFeed clusters={feed} />
    </main>
  );
}
