"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  createEstimateDraftAction,
  updateEstimateDraftAction,
} from "@/app/actions/estimates";
import type { ActionState } from "@/app/actions/organizations";
import {
  LineItemsEditor,
  TotalsPreview,
  usePreviewTotals,
  type EditorLine,
} from "@/components/line-items-editor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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

/** Estimate builder — the invoice builder's sibling, sharing the line
 * editor and live-preview math; expiry replaces due date/payment terms. */

export interface EstimateFormProps {
  organizationId: string;
  customers: Array<{ id: string; name: string }>;
  products: Array<{
    id: string;
    name: string;
    unitPrice: string;
    currency: string;
    defaultTaxRateBps: number | null;
  }>;
  taxRates: Array<{ id: string; name: string; rateBps: number }>;
  baseCurrency: string;
  allowedCurrencies: string[];
  defaultLineTaxRateBps: number;
  estimate?: {
    id: string;
    version: number;
    customerId: string;
    currency: string;
    issueDate: string | null;
    expiryDate: string | null;
    notes: string | null;
    terms: string | null;
    lines: EditorLine[];
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function EstimateForm({
  organizationId,
  customers,
  products,
  taxRates,
  baseCurrency,
  allowedCurrencies,
  defaultLineTaxRateBps,
  estimate,
}: EstimateFormProps) {
  const editing = Boolean(estimate);
  const today = isoDate(new Date());
  const defaultExpiry = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 30);
    return isoDate(d);
  })();

  const [customerId, setCustomerId] = useState(estimate?.customerId ?? "");
  const [currency, setCurrency] = useState(estimate?.currency ?? baseCurrency);
  const [lines, setLines] = useState<EditorLine[]>(
    estimate?.lines.length
      ? estimate.lines
      : [
          {
            productId: null,
            description: "",
            quantity: "1",
            unitPrice: "",
            discountBps: 0,
            taxRateBps: defaultLineTaxRateBps,
          },
        ],
  );
  const preview = usePreviewTotals(lines, currency);

  const [state, action, pending] = useActionState<ActionState, FormData>(
    editing
      ? updateEstimateDraftAction.bind(null, organizationId)
      : createEstimateDraftAction.bind(null, organizationId),
    { error: null },
  );

  return (
    <form action={action} className="space-y-8">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {editing && (
        <>
          <input type="hidden" name="id" value={estimate!.id} />
          <input type="hidden" name="version" value={estimate!.version} />
        </>
      )}
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />

      <fieldset className="space-y-4">
        <legend className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Estimate details
        </legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="est-customer">Customer</Label>
            <Select
              name="customerId"
              value={customerId}
              onValueChange={setCustomerId}
              required
            >
              <SelectTrigger id="est-customer" className="w-full">
                <SelectValue placeholder="Choose a customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="est-currency">Currency</Label>
            <Select name="currency" value={currency} onValueChange={setCurrency}>
              <SelectTrigger id="est-currency" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowedCurrencies.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                    {c === baseCurrency ? " (base)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="est-issue">Issue date</Label>
            <Input
              id="est-issue"
              name="issueDate"
              type="date"
              defaultValue={estimate?.issueDate ?? today}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="est-expiry">Valid until</Label>
            <Input
              id="est-expiry"
              name="expiryDate"
              type="date"
              defaultValue={estimate?.expiryDate ?? defaultExpiry}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Line items
        </legend>
        <LineItemsEditor
          lines={lines}
          onLinesChange={setLines}
          products={products}
          taxRates={taxRates}
          currency={currency}
          defaultTaxRateBps={defaultLineTaxRateBps}
        />
      </fieldset>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <fieldset className="space-y-4">
          <legend className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Notes & terms
          </legend>
          <div className="space-y-2">
            <Label htmlFor="est-notes">Notes to the customer</Label>
            <Textarea
              id="est-notes"
              name="notes"
              rows={3}
              defaultValue={estimate?.notes ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="est-terms">Terms & conditions</Label>
            <Textarea
              id="est-terms"
              name="terms"
              rows={3}
              defaultValue={estimate?.terms ?? ""}
            />
          </div>
        </fieldset>
        <TotalsPreview totals={preview.totals} />
      </div>

      <div className="flex items-center gap-2 border-t pt-4">
        <Button type="submit" disabled={pending || !customerId}>
          {pending ? "Saving…" : editing ? "Save draft" : "Create draft"}
        </Button>
        <Button asChild type="button" variant="outline">
          <Link
            href={
              editing
                ? `/orgs/${organizationId}/estimates/${estimate!.id}`
                : `/orgs/${organizationId}/estimates`
            }
          >
            Cancel
          </Link>
        </Button>
        <p className="ml-auto text-xs text-muted-foreground">
          The EST number is assigned when you issue.
        </p>
      </div>
    </form>
  );
}
