"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { lockSpecAction, unlockSpecAction } from "@/app/app/clusters/[id]/validate/actions";

export function LockToggle({
  specId,
  initialLocked,
}: {
  specId: string;
  initialLocked: boolean;
}): React.ReactNode {
  const [locked, setLocked] = useState(initialLocked);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={locked ? "default" : "outline"}
        size="sm"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            setError(null);
            const result = locked
              ? await unlockSpecAction(specId)
              : await lockSpecAction(specId);
            if (result.ok) setLocked(!locked);
            else setError(result.error ?? "failed");
          });
        }}
      >
        {pending ? "…" : locked ? "Unlock" : "Lock spec"}
      </Button>
      {error !== null && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
