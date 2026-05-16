import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClusterSaveButton } from "@/components/cluster-save-button";
import { supabaseServer } from "@/server/db/server";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function ClusterDetail({
  params,
}: {
  params: Params;
}): Promise<React.ReactNode> {
  const { id } = await params;

  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user === null) {
    redirect(`/login?next=/app/clusters/${id}`);
  }

  const { data: cluster } = await sb
    .from("clusters")
    .select("id, title, summary, pain_score, audience, keywords, member_count, last_signal_at")
    .eq("id", id)
    .maybeSingle();
  if (cluster === null) notFound();

  const [{ data: signals }, { data: saveRow }] = await Promise.all([
    sb
      .from("signals")
      .select("id, source, title, body, url, posted_at, score, comments_count")
      .eq("cluster_id", id)
      .order("score", { ascending: false, nullsFirst: false })
      .limit(25),
    sb
      .from("cluster_saves")
      .select("user_id")
      .eq("cluster_id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const saved = saveRow !== null && saveRow !== undefined;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <Link
        href="/app"
        className="self-start text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
      >
        ← Back to feed
      </Link>

      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">
            {cluster.title ?? "Untitled cluster"}
          </h1>
          <div className="flex items-center gap-2">
            {cluster.pain_score !== null && (
              <Badge variant="secondary" title="Pain score (0-10)">
                {cluster.pain_score.toFixed(1)}
              </Badge>
            )}
            <ClusterSaveButton clusterId={cluster.id} initialSaved={saved} />
          </div>
        </div>
        {cluster.audience !== null && (
          <p className="text-xs uppercase tracking-wide text-zinc-500">{cluster.audience}</p>
        )}
        {cluster.summary !== null && (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{cluster.summary}</p>
        )}
        {cluster.keywords !== null && cluster.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {cluster.keywords.map((k) => (
              <Badge key={k} variant="outline" className="text-[10px]">
                {k}
              </Badge>
            ))}
          </div>
        )}
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          {cluster.member_count} signal{cluster.member_count === 1 ? "" : "s"}
        </h2>
        {(signals ?? []).map((s) => (
          <Card key={s.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium hover:underline"
                >
                  {s.title ?? "(no title)"}
                </a>
                <Badge variant="outline" className="text-[10px] uppercase">
                  {s.source}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="line-clamp-4 text-sm text-zinc-700 dark:text-zinc-300">{s.body}</p>
              <p className="mt-2 text-xs text-zinc-500">
                Score {s.score ?? "—"} · {s.comments_count ?? 0} comments ·{" "}
                {new Date(s.posted_at).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
