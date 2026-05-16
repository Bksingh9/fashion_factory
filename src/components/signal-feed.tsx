/**
 * SignalFeed — RSC component that renders the top demand clusters as cards.
 *
 * Each card shows the cluster title, summary, pain_score, audience, and
 * a few keywords, plus a Save toggle (client island). The query upstream
 * also surfaces whether the calling user has saved each row so we can
 * render the correct initial state.
 */
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClusterSaveButton } from "./cluster-save-button";

export interface FeedCluster {
  id: string;
  title: string | null;
  summary: string | null;
  pain_score: number | null;
  audience: string | null;
  keywords: string[] | null;
  member_count: number;
  last_signal_at: string;
  /** Whether the current viewer has already saved this cluster. */
  saved_by_me: boolean;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMins = Math.max(1, Math.round((Date.now() - then) / 60_000));
  if (diffMins < 60) return `${String(diffMins)}m ago`;
  const diffHrs = Math.round(diffMins / 60);
  if (diffHrs < 24) return `${String(diffHrs)}h ago`;
  return `${String(Math.round(diffHrs / 24))}d ago`;
}

export function SignalFeed({ clusters }: { clusters: FeedCluster[] }): React.ReactNode {
  if (clusters.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700">
        No clusters yet. Once the crawlers tick over (Inngest cron every 10 min) and a few
        signals embed + cluster, opportunities will surface here.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {clusters.map((c) => (
        <Card key={c.id} className="flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="flex items-start justify-between gap-3">
              <Link
                href={`/app/clusters/${c.id}`}
                className="line-clamp-2 text-lg font-semibold hover:underline"
              >
                {c.title ?? "Untitled cluster"}
              </Link>
              {c.pain_score !== null && (
                <Badge variant="secondary" title="Pain score (0-10)">
                  {c.pain_score.toFixed(1)}
                </Badge>
              )}
            </CardTitle>
            {c.audience !== null && (
              <CardDescription className="text-xs uppercase tracking-wide text-zinc-500">
                {c.audience}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {c.summary !== null && (
              <p className="line-clamp-3 text-sm text-zinc-700 dark:text-zinc-300">{c.summary}</p>
            )}
            {c.keywords !== null && c.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {c.keywords.slice(0, 6).map((k) => (
                  <Badge key={k} variant="outline" className="text-[10px]">
                    {k}
                  </Badge>
                ))}
              </div>
            )}
            <div className="mt-1 flex items-center justify-between">
              <span className="text-xs text-zinc-500">
                {c.member_count} signal{c.member_count === 1 ? "" : "s"} · {formatRelative(c.last_signal_at)}
              </span>
              <ClusterSaveButton clusterId={c.id} initialSaved={c.saved_by_me} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
