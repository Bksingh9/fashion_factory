import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseServer } from "@/server/db/server";

export const dynamic = "force-dynamic";

type Params = Promise<{ runId: string }>;

export default async function ShipRunPage({
  params,
}: {
  params: Params;
}): Promise<React.ReactNode> {
  const { runId } = await params;
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user === null) {
    redirect(`/login?next=/app/ship/${runId}`);
  }

  const { data: run } = await sb
    .from("ship_runs")
    .select("id, status, repo_owner, repo_name, repo_url, error, started_at, finished_at, metrics, spec_id")
    .eq("id", runId)
    .maybeSingle();
  if (run === null) notFound();

  const { data: files } = await sb
    .from("ship_files")
    .select("path, generated_by, bytes")
    .eq("run_id", runId)
    .order("path", { ascending: true });

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <Link href="/app" className="self-start text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400">
        ← Back to feed
      </Link>

      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Ship run</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {run.repo_url !== null ? (
              <a href={run.repo_url} target="_blank" rel="noopener noreferrer" className="underline">
                {run.repo_url}
              </a>
            ) : (
              "Repo not created yet"
            )}
          </p>
        </div>
        <Badge
          variant={
            run.status === "done" ? "default" : run.status === "failed" ? "outline" : "secondary"
          }
        >
          {run.status}
        </Badge>
      </header>

      {run.error !== null && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {run.error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-700 dark:text-zinc-300">
          <p>Started: {new Date(run.started_at).toLocaleString()}</p>
          {run.finished_at !== null && <p>Finished: {new Date(run.finished_at).toLocaleString()}</p>}
        </CardContent>
      </Card>

      {(files ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Generated files ({(files ?? []).length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 font-mono text-xs">
              {(files ?? []).map((f) => (
                <li key={f.path} className="flex justify-between gap-3">
                  <span>{f.path}</span>
                  <span className="text-zinc-500">
                    {f.generated_by} {f.bytes !== null ? `· ${String(f.bytes)}b` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
