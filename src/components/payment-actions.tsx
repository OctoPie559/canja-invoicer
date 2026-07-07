"use client";

import { useActionState, useState } from "react";
import { Banknote } from "lucide-react";
import { recordPaymentAction } from "@/app/actions/payments";
import type { ActionState } from "@/app/actions/organizations";
import { SUPPORTED_CURRENCIES } from "@/lib/validation/currencies";
import { PAYMENT_METHODS } from "@/lib/validation/payments";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const METHOD_LABELS: Record<(typeof PAYMENT_METHODS)[number], string> = {
  mpesa: "M-Pesa",
  bank: "Bank transfer",
  cash: "Cash",
  card: "Card",
  other: "Other",
};

export function RecordPaymentDialog({
  organizationId,
  invoiceId,
  displayNumber,
  invoiceCurrency,
  balanceDue,
}: {
  organizationId: string;
  invoiceId: string;
  displayNumber: string;
  invoiceCurrency: string;
  /** formatted, for the helper text */
  balanceDue: string;
}) {
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState(invoiceCurrency);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    recordPaymentAction.bind(null, organizationId),
    { error: null },
  );
  const cross = currency !== invoiceCurrency;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Banknote />
          Record payment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={action} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Record a payment — {displayNumber}</DialogTitle>
            <DialogDescription>
              Balance due: <span className="font-mono">{balanceDue}</span>.
              Payments are recorded exactly as received and cannot be edited
              later.
            </DialogDescription>
          </DialogHeader>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">Amount received</Label>
              <Input
                id="pay-amount"
                name="amount"
                inputMode="decimal"
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-currency">Currency</Label>
              <Select name="currency" value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="pay-currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                      {c === invoiceCurrency ? " (invoice)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {cross && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="pay-fx">
                  Exchange rate — 1 {currency} in {invoiceCurrency}
                </Label>
                <Input
                  id="pay-fx"
                  name="fxRateUsed"
                  inputMode="decimal"
                  placeholder="e.g. 0.00771605"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Any over-payment from rate movement is recorded explicitly,
                  never folded into the balance.
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="pay-method">Method</Label>
              <Select name="method" defaultValue="mpesa">
                <SelectTrigger id="pay-method" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">Payment date</Label>
              <Input
                id="pay-date"
                name="paidAt"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pay-ref">Reference (e.g. M-Pesa code)</Label>
              <Input id="pay-ref" name="reference" placeholder="TGH4X8K2M1" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pay-notes">Notes</Label>
              <Textarea id="pay-notes" name="notes" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Recording…" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
