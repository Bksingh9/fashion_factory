"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export function ShipStartButton({
  specId,
  hasInstall,
}: {
  specId: string;
  hasInstall: boolean;
}): React.ReactNode {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!hasInstall) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Install the PainPilot GitHub App first:{" "}
        <a href="/app/github/install" className="underline">
          /app/github/install
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            setError(null);
            try {
              const res = await fetch("/api/ship/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ spec_id: specId }),
              });
              if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error ?? `HTTP ${String(res.status)}`);
              }
              if (typeof window !== "undefined") window.location.reload();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          });
        }}
      >
        {pending ? "Queueing…" : "Ship to GitHub"}
      </Button>
      {error !== null && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
