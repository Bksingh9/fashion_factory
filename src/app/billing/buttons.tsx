"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

async function postJson(url: string): Promise<{ url?: string; error?: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return (await res.json()) as { url?: string; error?: string };
}

export function CheckoutButton({ plan }: { plan: "pro" | "studio" | "agency" }): React.ReactNode {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          try {
            const res = await fetch("/api/stripe/checkout", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ plan }),
            });
            const body = (await res.json()) as { url?: string; error?: string };
            if (body.url !== undefined) {
              window.location.assign(body.url);
              return;
            }
            setError(body.error ?? "Unknown error");
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setLoading(false);
          }
        }}
      >
        {loading ? "Loading…" : `Upgrade to ${plan}`}
      </Button>
      {error !== null && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export function ManageButton(): React.ReactNode {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant="outline"
      type="button"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        const body = await postJson("/api/stripe/portal");
        if (body.url !== undefined) {
          window.location.assign(body.url);
          return;
        }
        setLoading(false);
      }}
    >
      {loading ? "Loading…" : "Manage subscription"}
    </Button>
  );
}
