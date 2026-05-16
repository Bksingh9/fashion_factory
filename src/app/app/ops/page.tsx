import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseServer } from "@/server/db/server";

export const dynamic = "force-dynamic";

export default async function OpsPage(): Promise<React.ReactNode> {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user === null) {
    redirect("/login?next=/app/ops");
  }

  const { data: profile } = await sb
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile === null || profile.role !== "admin") {
    notFound();
  }

  const { data: evalRuns } = await sb
    .from("eval_runs")
    .select("id, prompt_name, prompt_version, passed, failed, total, score, started_at")
    .order("started_at", { ascending: false })
    .limit(20);

  const { data: violations } = await sb
    .from("perf_budget_violations")
    .select("id, route, metric, threshold, observed, window, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <Link
        href="/app"
        className="self-start text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
      >
        ← Back to feed
      </Link>

      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Ops</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Admin-only. Recent promptfoo regressions + perf-budget violations.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Recent eval runs ({(evalRuns ?? []).length})</h2>
        {(evalRuns ?? []).length === 0 ? (
          <p className="text-sm text-zinc-500">
            No runs yet. <code>eval.run.nightly</code> fires at 02:00 UTC.
          </p>
        ) : (
          (evalRuns ?? []).map((r) => (
            <Card key={r.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>
                    {r.prompt_name}@{r.prompt_version}
                  </span>
                  <Badge variant={r.failed === 0 ? "default" : "outline"}>
                    {r.passed}/{r.total}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-zinc-500">
                {new Date(r.started_at).toLocaleString()}
                {r.score !== null && ` · score ${r.score.toFixed(3)}`}
              </CardContent>
            </Card>
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Recent perf-budget violations ({(violations ?? []).length})</h2>
        {(violations ?? []).length === 0 ? (
          <p className="text-sm text-zinc-500">
            All budgets healthy. <code>perf.budget.scan</code> sweeps every 5 min.
          </p>
        ) : (
          (violations ?? []).map((v) => (
            <Card key={v.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {v.route} · {v.metric}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-zinc-500">
                threshold {v.threshold} / observed {v.observed} ({v.window}) at{" "}
                {new Date(v.created_at).toLocaleString()}
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </main>
  );
}
