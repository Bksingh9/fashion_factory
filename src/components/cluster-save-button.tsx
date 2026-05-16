"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toggleSaveAction } from "@/app/app/actions";

export function ClusterSaveButton({
  clusterId,
  initialSaved,
}: {
  clusterId: string;
  initialSaved: boolean;
}): React.ReactNode {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={saved ? "default" : "outline"}
      size="sm"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await toggleSaveAction(clusterId);
          setSaved(result.saved);
        });
      }}
    >
      {pending ? "…" : saved ? "Saved" : "Save"}
    </Button>
  );
}
