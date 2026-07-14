"use client";

import { useActionState } from "react";
import { startInvoiceCheckoutAction } from "@/app/actions/checkout";
import type { ActionState } from "@/app/actions/organizations";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Public "Pay now" on the hosted invoice view. Submits to the checkout action,
 * which initiates the charge and redirects the payer to the provider (M-Pesa /
 * card). Email pre-fills from the invoice's primary contact when present.
 */
export function PayInvoice({
  token,
  balanceLabel,
  prefillEmail,
}: {
  token: string;
  balanceLabel: string;
  prefillEmail?: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    startInvoiceCheckoutAction.bind(null, token),
    { error: null },
  );

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="font-heading text-base font-semibold">Pay online</h2>
          <span className="font-mono text-sm text-muted-foreground">
            {balanceLabel} due
          </span>
        </div>
        <form action={action} className="space-y-3">
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="pay-email">Email for the receipt</Label>
            <Input
              id="pay-email"
              name="email"
              type="email"
              defaultValue={prefillEmail ?? ""}
              placeholder="you@example.com"
              required={!prefillEmail}
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Redirecting…" : `Pay ${balanceLabel}`}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Secure payment by M-Pesa or card. You&apos;ll be redirected to
            complete it.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
