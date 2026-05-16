"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type SectionKind = "audience" | "competitors" | "wtp_pricing" | "features" | "gtm";

const SECTIONS: SectionKind[] = ["audience", "competitors", "wtp_pricing", "features", "gtm"];

export function ValidateRunner({
  clusterId,
  specId,
}: {
  clusterId: string;
  specId: string | null;
}): React.ReactNode {
  const [running, setRunning] = useState<SectionKind | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function requestRun(sections?: SectionKind[]): Promise<void> {
    const res = await fetch("/api/validate/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cluster_id: clusterId,
        ...(sections === undefined ? {} : { sections }),
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `HTTP ${String(res.status)}`);
    }
  }

  async function streamSection(section: SectionKind): Promise<void> {
    if (specId === null) {
      throw new Error("create the spec first via Generate all");
    }
    const res = await fetch("/api/validate/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spec_id: specId, section }),
    });
    if (!res.ok || res.body === null) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `HTTP ${String(res.status)}`);
    }
    // Drain the stream — UI is intentionally minimal here; the page
    // re-fetches on revalidate so the section JSON reappears.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
      // discard chunks; the page reload after this function returns will
      // surface the persisted result.
      decoder.decode();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={running !== null}
          onClick={() => {
            startTransition(async () => {
              setRunning("all");
              setError(null);
              try {
                await requestRun();
                if (typeof window !== "undefined") window.location.reload();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setRunning(null);
              }
            });
          }}
        >
          {running === "all" ? "Queued…" : "Generate all sections"}
        </Button>
        {specId !== null && (
          <span className="text-xs text-zinc-500">spec id: {specId.slice(0, 8)}…</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {SECTIONS.map((s) => (
          <Button
            key={s}
            type="button"
            variant="outline"
            size="sm"
            disabled={running !== null || specId === null}
            onClick={() => {
              startTransition(async () => {
                setRunning(s);
                setError(null);
                try {
                  await streamSection(s);
                  if (typeof window !== "undefined") window.location.reload();
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setRunning(null);
                }
              });
            }}
          >
            {running === s ? "…" : `Regenerate ${s.replace("_", " ")}`}
          </Button>
        ))}
      </div>

      {error !== null && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
