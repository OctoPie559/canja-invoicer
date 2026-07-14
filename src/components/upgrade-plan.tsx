"use client";

import { useActionState, useState } from "react";
import { startSubscriptionCheckoutAction } from "@/app/actions/checkout";
import type { ActionState } from "@/app/actions/organizations";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Pro upgrade (self-billing). Picks a billing interval and starts the checkout
 * action, which charges through the same rail as customer invoices and
 * redirects to the provider. Owner-only — the page gates rendering.
 */
export function UpgradePlan({
  organizationId,
  monthlyLabel,
  annualLabel,
}: {
  organizationId: string;
  monthlyLabel: string;
  annualLabel: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    startSubscriptionCheckoutAction.bind(null, organizationId),
    { error: null },
  );
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");

  const options = [
    { value: "monthly" as const, title: "Monthly", price: monthlyLabel, note: "billed every month" },
    { value: "annual" as const, title: "Annual", price: annualLabel, note: "two months free" },
  ];

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="interval" value={interval} />
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setInterval(opt.value)}
            aria-pressed={interval === opt.value}
            className={cn(
              "rounded-lg border p-4 text-left transition-colors",
              interval === opt.value
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:bg-muted",
            )}
          >
            <div className="flex items-baseline justify-between">
              <span className="font-medium">{opt.title}</span>
              <span className="font-mono text-sm">{opt.price}</span>
            </div>
            <span className="text-xs text-muted-foreground">{opt.note}</span>
          </button>
        ))}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Redirecting…" : "Upgrade to Pro"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Paid securely by M-Pesa or card. Your plan activates as soon as the
        payment confirms.
      </p>
    </form>
  );
}
