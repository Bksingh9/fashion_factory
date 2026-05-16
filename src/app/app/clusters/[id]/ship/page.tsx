import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShipStartButton } from "@/components/ship-start-button";
import { supabaseServer } from "@/server/db/server";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function ShipPage({
  params,
}: {
  params: Params;
}): Promise<React.ReactNode> {
  const { id: clusterId } = await params;
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user === null) {
    redirect(`/login?next=/app/clusters/${clusterId}/ship`);
  }

  const { data: cluster } = await sb
    .from("clusters")
    .select("id, title")
    .eq("id", clusterId)
    .maybeSingle();
  if (cluster === null) notFound();

  const { data: spec } = await sb
    .from("specs")
    .select("id, status")
    .eq("cluster_id", clusterId)
    .eq("user_id", user.id)
    .eq("version", 1)
    .maybeSingle();

  const { data: install } = await sb
    .from("github_installations")
    .select("installation_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: recentRuns } = spec
    ? await sb
        .from("ship_runs")
        .select("id, status, repo_url, started_at, finished_at, error")
        .eq("spec_id", spec.id)
        .order("started_at", { ascending: false })
        .limit(10)
    : { data: [] };

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <Link
        href={`/app/clusters/${clusterId}/validate`}
        className="self-start text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
      >
        ← Back to validate
      </Link>

      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Ship: {cluster.title ?? "Untitled"}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          A locked spec is required. Shipping creates a fresh private GitHub repo via the
          PainPilot App.
        </p>
      </header>

      {spec === null || spec === undefined ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          No spec yet. Go to{" "}
          <Link href={`/app/clusters/${clusterId}/validate`} className="underline">
            validate
          </Link>{" "}
          first.
        </div>
      ) : spec.status !== "locked" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Spec is still a draft. Lock it on the validate page before shipping.
        </div>
      ) : (
        <ShipStartButton specId={spec.id} hasInstall={install !== null && install !== undefined} />
      )}

      {(recentRuns ?? []).length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Recent ship runs</h2>
          {(recentRuns ?? []).map((r) => (
            <Card key={r.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <Link href={`/app/ship/${r.id}`} className="hover:underline">
                    {r.repo_url ?? r.id.slice(0, 8)}
                  </Link>
                  <Badge
                    variant={
                      r.status === "done" ? "default" : r.status === "failed" ? "outline" : "secondary"
                    }
                  >
                    {r.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-zinc-500">
                Started {new Date(r.started_at).toLocaleString()}{" "}
                {r.finished_at !== null && ` · Finished ${new Date(r.finished_at).toLocaleString()}`}
                {r.error !== null && (
                  <p className="mt-2 text-red-600 dark:text-red-400">{r.error}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </main>
  );
}
