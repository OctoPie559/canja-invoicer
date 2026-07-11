"use client";

import { useState, useTransition } from "react";
import { Pause, Play, Square } from "lucide-react";
import { recurringActionAction } from "@/app/actions/recurring";
import { Button } from "@/components/ui/button";

/** Pause / resume / end — the schedule status machine, mirrored in the UI. */
export function RecurringStatusActions({
  organizationId,
  recurringId,
  status,
}: {
  organizationId: string;
  recurringId: string;
  status: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: "pause" | "resume" | "end") =>
    startTransition(async () => {
      const result = await recurringActionAction(
        organizationId,
        recurringId,
        action,
      );
      if (result?.error) setError(result.error);
    });

  if (status === "ended") return null;

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      {status === "active" && (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => run("pause")}
        >
          <Pause />
          Pause
        </Button>
      )}
      {status === "paused" && (
        <Button size="sm" disabled={pending} onClick={() => run("resume")}>
          <Play />
          Resume
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run("end")}
      >
        <Square />
        End
      </Button>
    </span>
  );
}
