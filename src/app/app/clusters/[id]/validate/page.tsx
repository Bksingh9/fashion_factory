import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LockToggle } from "@/components/lock-toggle";
import { ValidateRunner } from "@/components/validate-runner";
import { supabaseServer } from "@/server/db/server";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

const SECTION_LABELS: Record<string, string> = {
  audience: "Audience",
  competitors: "Competitors",
  wtp: "Willingness to pay",
  pricing: "Pricing",
  features: "Features",
  gtm: "Go-to-market",
};

export default async function ValidatePage({
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
    redirect(`/login?next=/app/clusters/${clusterId}/validate`);
  }

  const { data: cluster } = await sb
    .from("clusters")
    .select("id, title, summary, pain_score, audience, keywords")
    .eq("id", clusterId)
    .maybeSingle();
  if (cluster === null) notFound();

  // Find the user's draft (or locked) spec for this cluster. Phase 3
  // uses version=1 always; Phase 4 will introduce versioning on
  // re-validate-after-ship.
  const { data: spec } = await sb
    .from("specs")
    .select("id, status, audience, competitors, wtp, pricing, features, gtm, locked_at, updated_at")
    .eq("cluster_id", clusterId)
    .eq("user_id", user.id)
    .eq("version", 1)
    .maybeSingle();

  const sectionEntries: { key: string; payload: unknown }[] = spec
    ? [
        { key: "audience", payload: spec.audience },
        { key: "competitors", payload: spec.competitors },
        { key: "wtp", payload: spec.wtp },
        { key: "pricing", payload: spec.pricing },
        { key: "features", payload: spec.features },
        { key: "gtm", payload: spec.gtm },
      ]
    : [];

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <Link
        href={`/app/clusters/${clusterId}`}
        className="self-start text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
      >
        ← Back to cluster
      </Link>

      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Validate: {cluster.title ?? "Untitled cluster"}
          </h1>
          {cluster.audience !== null && (
            <p className="text-xs uppercase tracking-wide text-zinc-500">{cluster.audience}</p>
          )}
          {cluster.summary !== null && (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{cluster.summary}</p>
          )}
        </div>
        {spec !== null && spec !== undefined && (
          <div className="flex flex-col items-end gap-2">
            <Badge variant={spec.status === "locked" ? "default" : "secondary"}>
              {spec.status === "locked" ? "Locked" : "Draft"}
            </Badge>
            <LockToggle specId={spec.id} initialLocked={spec.status === "locked"} />
          </div>
        )}
      </header>

      <ValidateRunner clusterId={clusterId} specId={spec?.id ?? null} />

      {spec === null || spec === undefined ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700">
          No spec yet. Click <strong>Generate all sections</strong> above to start. The
          Inngest pipeline will validate audience → competitors → pricing → features → GTM
          in order.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {sectionEntries.map(({ key, payload }) => (
            <Card key={key}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{SECTION_LABELS[key] ?? key}</span>
                  <Badge variant={payload === null ? "outline" : "secondary"} className="text-[10px]">
                    {payload === null ? "empty" : "filled"}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Edits and regeneration are gated when the spec is locked.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="max-h-64 overflow-auto rounded bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
                  {payload === null
                    ? "(not generated yet)"
                    : JSON.stringify(payload, null, 2)}
                </pre>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
