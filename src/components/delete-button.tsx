"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/actions/organizations";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const initialState: ActionState = { error: null };

/**
 * Destructive submit for a pre-bound server action, with domain errors
 * (stale version, permissions) surfaced inline instead of a 500 boundary.
 */
export function DeleteButton({
  action,
  label = "Delete",
}: {
  action: () => Promise<ActionState>;
  label?: string;
}) {
  const [state, formAction, pending] = useActionState(
    async (): Promise<ActionState> => action(),
    initialState,
  );
  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <Button variant="destructive" size="sm" type="submit" disabled={pending}>
        {pending ? "Deleting…" : label}
      </Button>
      {state.error && (
        <Alert variant="destructive" className="max-w-sm">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
