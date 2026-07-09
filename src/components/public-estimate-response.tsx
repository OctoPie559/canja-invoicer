"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import {
  publicEstimateDecisionAction,
  recordEstimateViewAction,
} from "@/app/actions/estimates-public";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Records a view once on real browser mount (not on link-scanner prefetch,
 * which never runs this effect) and, while the quote awaits a decision,
 * offers the customer Accept / Decline. On success it reloads so the page
 * reflects the new status from the server.
 */
export function PublicEstimateResponse({
  token,
  awaitingDecision,
  expired,
}: {
  token: string;
  awaitingDecision: boolean;
  /** past the valid-until date — accept is not offered */
  expired: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void recordEstimateViewAction(token);
  }, [token]);

  if (!awaitingDecision) return null;

  const respond = (decision: "accepted" | "declined") =>
    startTransition(async () => {
      const result = await publicEstimateDecisionAction(token, decision);
      if (result.error) {
        setError(result.error);
      } else {
        window.location.reload();
      }
    });

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-4">
      <p className="text-sm font-medium">Ready to proceed?</p>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        {!expired && (
          <Button disabled={pending} onClick={() => respond("accepted")}>
            <Check />
            Accept quote
          </Button>
        )}
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => respond("declined")}
        >
          <X />
          Decline
        </Button>
      </div>
      {expired && (
        <p className="text-xs text-muted-foreground">
          This quote has passed its valid-until date. Contact the sender for
          an updated quote.
        </p>
      )}
    </div>
  );
}
