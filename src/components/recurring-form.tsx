"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  createRecurringAction,
  updateRecurringAction,
} from "@/app/actions/recurring";
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

/** Recurring-schedule builder — the invoice builder's sibling, sharing the
 * line editor and live-preview math; frequency + start/end replace dates. */

export interface RecurringFormProps {
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
  /** Latest date this schedule has already invoiced (edit only) — the next
   * run cannot be moved to or before it, or the cron would re-bill. */
  lastBilledDate?: string | null;
  schedule?: {
    id: string;
    version: number;
    customerId: string;
    currency: string;
    frequency: string;
    intervalCount: number;
    startDate: string;
    endDate: string | null;
    autoIssue: string;
    notes: string | null;
    terms: string | null;
    lines: EditorLine[];
  };
}

const FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The calendar day after an ISO date (yyyy-mm-dd), in UTC. */
function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return isoDate(d);
}

export function RecurringForm({
  organizationId,
  customers,
  products,
  taxRates,
  baseCurrency,
  allowedCurrencies,
  defaultLineTaxRateBps,
  lastBilledDate,
  schedule,
}: RecurringFormProps) {
  const editing = Boolean(schedule);
  const today = isoDate(new Date());
  // the next run must fall strictly after the last invoiced date
  const minStart = lastBilledDate ? nextDay(lastBilledDate) : undefined;

  const [customerId, setCustomerId] = useState(schedule?.customerId ?? "");
  const [currency, setCurrency] = useState(schedule?.currency ?? baseCurrency);
  const [frequency, setFrequency] = useState(schedule?.frequency ?? "monthly");
  const [autoIssue, setAutoIssue] = useState(schedule?.autoIssue ?? "draft");
  const [startDate, setStartDate] = useState(schedule?.startDate ?? today);
  const startTooEarly = Boolean(lastBilledDate && startDate <= lastBilledDate);
  const [lines, setLines] = useState<EditorLine[]>(
    schedule?.lines.length
      ? schedule.lines
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
  const foreign = currency !== baseCurrency;

  const [state, action, pending] = useActionState<ActionState, FormData>(
    editing
      ? updateRecurringAction.bind(null, organizationId)
      : createRecurringAction.bind(null, organizationId),
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
          <input type="hidden" name="id" value={schedule!.id} />
          <input type="hidden" name="version" value={schedule!.version} />
        </>
      )}
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <input type="hidden" name="frequency" value={frequency} />
      <input type="hidden" name="autoIssue" value={autoIssue} />

      <fieldset className="space-y-4">
        <legend className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Schedule details
        </legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="rec-customer">Customer</Label>
            <Select
              name="customerId"
              value={customerId}
              onValueChange={setCustomerId}
              required
            >
              <SelectTrigger id="rec-customer" className="w-full">
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
            <Label htmlFor="rec-currency">Currency</Label>
            <Select name="currency" value={currency} onValueChange={setCurrency}>
              <SelectTrigger id="rec-currency" className="w-full">
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
            <Label htmlFor="rec-frequency">Frequency</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger id="rec-frequency" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rec-interval">Every</Label>
            <Input
              id="rec-interval"
              name="intervalCount"
              type="number"
              min={1}
              max={60}
              defaultValue={schedule?.intervalCount ?? 1}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rec-start">
              {editing ? "Next invoice on" : "First invoice on"}
            </Label>
            <Input
              id="rec-start"
              name="startDate"
              type="date"
              min={minStart}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-invalid={startTooEarly}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rec-end">End date (optional)</Label>
            <Input
              id="rec-end"
              name="endDate"
              type="date"
              defaultValue={schedule?.endDate ?? ""}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rec-autoissue">On each run</Label>
          <Select
            value={autoIssue}
            onValueChange={setAutoIssue}
            disabled={foreign}
          >
            <SelectTrigger id="rec-autoissue" className="w-full sm:w-80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Create a draft to review</SelectItem>
              <SelectItem value="issue">Issue and number automatically</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {foreign
              ? "Foreign-currency runs always land as a draft — they need an exchange rate you set before issuing."
              : "Auto-issue skips the draft step and assigns an INV number on the run date."}
          </p>
        </div>
        {startTooEarly && (
          <Alert variant="destructive">
            <AlertDescription>
              This schedule has already invoiced up to{" "}
              <span className="font-medium">{lastBilledDate}</span>. Set the next
              invoice date after that — an earlier date would re-bill a period
              you&apos;ve already billed.
            </AlertDescription>
          </Alert>
        )}
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
            <Label htmlFor="rec-notes">Notes to the customer</Label>
            <Textarea
              id="rec-notes"
              name="notes"
              rows={3}
              defaultValue={schedule?.notes ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rec-terms">Terms & conditions</Label>
            <Textarea
              id="rec-terms"
              name="terms"
              rows={3}
              defaultValue={schedule?.terms ?? ""}
            />
          </div>
        </fieldset>
        <TotalsPreview totals={preview.totals} />
      </div>

      <div className="flex items-center gap-2 border-t pt-4">
        <Button type="submit" disabled={pending || !customerId || startTooEarly}>
          {pending ? "Saving…" : editing ? "Save schedule" : "Create schedule"}
        </Button>
        <Button asChild type="button" variant="outline">
          <Link
            href={
              editing
                ? `/orgs/${organizationId}/recurring/${schedule!.id}`
                : `/orgs/${organizationId}/recurring`
            }
          >
            Cancel
          </Link>
        </Button>
      </div>
    </form>
  );
}
