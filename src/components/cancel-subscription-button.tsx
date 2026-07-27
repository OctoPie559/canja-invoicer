"use client";

import { useActionState, useState } from "react";
import { cancelSubscriptionAction } from "@/app/actions/checkout";
import type { ActionState } from "@/app/actions/organizations";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Schedule cancel-at-period-end (wave 6), with a one-step confirm. */
export function CancelSubscriptionButton({
  organizationId,
}: {
  organizationId: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    () => cancelSubscriptionAction(organizationId),
    { error: null },
  );

  return (
    <form action={action} className="space-y-2">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Cancel — you&apos;ll keep Pro until the period ends?
          </span>
          <Button
            type="submit"
            variant="destructive"
            size="sm"
            disabled={pending}
          >
            {pending ? "Cancelling…" : "Confirm cancel"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirming(false)}
          >
            Keep plan
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setConfirming(true)}
        >
          Cancel subscription
        </Button>
      )}
    </form>
  );
}
