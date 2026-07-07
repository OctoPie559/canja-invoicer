"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  createInvoiceDraftAction,
  updateInvoiceDraftAction,
} from "@/app/actions/invoices";
import type { ActionState } from "@/app/actions/organizations";
import {
  computeInvoiceTotals,
  computeLine,
} from "@/lib/domain/invoice-math";
import { Money } from "@/lib/domain/money";
import {
  dueDateFor,
  PAYMENT_TERMS_PRESETS,
  paymentTermsLabel,
} from "@/lib/domain/payment-terms";
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

/**
 * Draft invoice builder (new + edit). Line items live in client state and
 * travel as one JSON field; the SAME domain math module that the service
 * uses runs here for the live totals, so the preview can never disagree
 * with what the server stores. All checks besides UX are server-side.
 */

export interface InvoiceFormLine {
  productId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discountBps: number;
  taxRateBps: number;
}

export interface InvoiceFormProps {
  organizationId: string;
  customers: Array<{
    id: string;
    name: string;
    /** the customer's own default terms; null = organization default */
    paymentTermsDays: number | null;
  }>;
  products: Array<{
    id: string;
    name: string;
    unitPrice: string;
    currency: string;
    defaultTaxRateBps: number | null;
  }>;
  taxRates: Array<{ id: string; name: string; rateBps: number }>;
  baseCurrency: string;
  /** Free plans invoice in base currency only (multiCurrency is Pro). */
  allowedCurrencies: string[];
  defaultPaymentTermsDays: number;
  invoice?: {
    id: string;
    version: number;
    customerId: string;
    currency: string;
    issueDate: string | null;
    dueDate: string | null;
    paymentTermsDays: number | null;
    notes: string | null;
    terms: string | null;
    lines: InvoiceFormLine[];
  };
}

const EMPTY_LINE: InvoiceFormLine = {
  productId: null,
  description: "",
  quantity: "1",
  unitPrice: "",
  discountBps: 0,
  taxRateBps: 0,
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function InvoiceForm({
  organizationId,
  customers,
  products,
  taxRates,
  baseCurrency,
  allowedCurrencies,
  defaultPaymentTermsDays,
  invoice,
}: InvoiceFormProps) {
  const editing = Boolean(invoice);
  const today = isoDate(new Date());

  const [customerId, setCustomerId] = useState(invoice?.customerId ?? "");
  const [currency, setCurrency] = useState(invoice?.currency ?? baseCurrency);
  const [lines, setLines] = useState<InvoiceFormLine[]>(
    invoice?.lines.length ? invoice.lines : [{ ...EMPTY_LINE }],
  );
  // payment terms drive the due date; "custom" means the due date was set
  // by hand and travels as-is (paymentTermsDays stays null on the draft)
  const [termsDays, setTermsDays] = useState<number | "custom">(
    editing
      ? (invoice!.paymentTermsDays ?? "custom")
      : defaultPaymentTermsDays,
  );
  const [issueDate, setIssueDate] = useState(invoice?.issueDate ?? today);
  const [dueDate, setDueDate] = useState(
    invoice?.dueDate ??
      dueDateFor(today, invoice?.paymentTermsDays ?? defaultPaymentTermsDays),
  );

  const applyTerms = (days: number | "custom", fromIssueDate = issueDate) => {
    setTermsDays(days);
    if (days !== "custom" && fromIssueDate) {
      setDueDate(dueDateFor(fromIssueDate, days));
    }
  };

  const pickCustomer = (id: string) => {
    setCustomerId(id);
    // adopting the customer's own terms is the point of storing them —
    // but never silently override a hand-picked custom due date
    const picked = customers.find((c) => c.id === id);
    if (picked?.paymentTermsDays != null && termsDays !== "custom") {
      applyTerms(picked.paymentTermsDays);
    }
  };

  // offer the org default and the customer's terms even when they aren't
  // one of the named presets
  const termsOptions = [
    ...new Set([
      ...PAYMENT_TERMS_PRESETS.map((p) => p.days),
      defaultPaymentTermsDays,
      ...(typeof termsDays === "number" ? [termsDays] : []),
    ]),
  ].sort((a, b) => a - b);

  const [state, action, pending] = useActionState<ActionState, FormData>(
    editing
      ? updateInvoiceDraftAction.bind(null, organizationId)
      : createInvoiceDraftAction.bind(null, organizationId),
    { error: null },
  );

  const setLine = (index: number, patch: Partial<InvoiceFormLine>) => {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    );
  };

  const pickProduct = (index: number, productId: string) => {
    if (productId === "custom") {
      setLine(index, { productId: null });
      return;
    }
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setLine(index, {
      productId,
      description: product.name,
      // autofill the price only when the catalog price is in this invoice's
      // currency — cross-currency prices need a human decision
      ...(product.currency === currency
        ? { unitPrice: product.unitPrice }
        : {}),
      ...(product.defaultTaxRateBps !== null
        ? { taxRateBps: product.defaultTaxRateBps }
        : {}),
    });
  };

  /** Live preview through the real domain math; partial input shows dashes. */
  const preview = useMemo(() => {
    const lineTotals = lines.map((l) => {
      try {
        return computeLine(
          {
            quantity: l.quantity,
            unitPriceMinor: Money.parse(l.unitPrice, currency).amountMinor,
            discountBps: l.discountBps,
            taxRateBps: l.taxRateBps,
          },
          currency,
        );
      } catch {
        return null;
      }
    });
    let totals = null;
    try {
      totals = computeInvoiceTotals(
        lines.map((l) => ({
          quantity: l.quantity,
          unitPriceMinor: Money.parse(l.unitPrice, currency).amountMinor,
          discountBps: l.discountBps,
          taxRateBps: l.taxRateBps,
        })),
        currency,
      );
    } catch {
      // leave null — some line is incomplete
    }
    return { lineTotals, totals };
  }, [lines, currency]);

  const money = (m: { toString(): string } | null | undefined) =>
    m ? m.toString() : "—";

  return (
    <form action={action} className="space-y-8">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {editing && (
        <>
          <input type="hidden" name="id" value={invoice!.id} />
          <input type="hidden" name="version" value={invoice!.version} />
        </>
      )}
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />

      {/* ---- invoice details ---- */}
      <fieldset className="space-y-4">
        <legend className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Invoice details
        </legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="inv-customer">Customer</Label>
            <Select
              name="customerId"
              value={customerId}
              onValueChange={pickCustomer}
              required
            >
              <SelectTrigger id="inv-customer" className="w-full">
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
            <Label htmlFor="inv-currency">Currency</Label>
            <Select
              name="currency"
              value={currency}
              onValueChange={setCurrency}
            >
              <SelectTrigger id="inv-currency" className="w-full">
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
            {allowedCurrencies.length === 1 && (
              <p className="text-xs text-muted-foreground">
                Foreign-currency invoicing is a Pro feature.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-issue-date">Issue date</Label>
            <Input
              id="inv-issue-date"
              name="issueDate"
              type="date"
              value={issueDate}
              onChange={(e) => {
                setIssueDate(e.target.value);
                if (termsDays !== "custom" && e.target.value) {
                  setDueDate(dueDateFor(e.target.value, termsDays));
                }
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-terms-days">Payment terms</Label>
            <Select
              value={termsDays === "custom" ? "custom" : String(termsDays)}
              onValueChange={(v) =>
                applyTerms(v === "custom" ? "custom" : Number(v))
              }
            >
              <SelectTrigger id="inv-terms-days" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {termsOptions.map((days) => (
                  <SelectItem key={days} value={String(days)}>
                    {paymentTermsLabel(days)}
                    {days === defaultPaymentTermsDays ? " (default)" : ""}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom due date</SelectItem>
              </SelectContent>
            </Select>
            <input
              type="hidden"
              name="paymentTermsDays"
              value={termsDays === "custom" ? "" : termsDays}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-due-date">Due date</Label>
            <Input
              id="inv-due-date"
              name="dueDate"
              type="date"
              value={dueDate}
              onChange={(e) => {
                // hand-editing the due date makes the terms "custom"
                setDueDate(e.target.value);
                setTermsDays("custom");
              }}
            />
            {termsDays !== "custom" && (
              <p className="text-xs text-muted-foreground">
                {paymentTermsLabel(termsDays)} from the issue date.
              </p>
            )}
          </div>
        </div>
      </fieldset>

      {/* ---- line items ---- */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Line items
        </legend>
        <div className="overflow-x-auto">
          <div className="min-w-[760px] space-y-2">
            <div className="grid grid-cols-[minmax(220px,2fr)_90px_130px_90px_150px_110px_36px] items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
              <span>Item</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Unit price</span>
              <span className="text-right">Disc %</span>
              <span>Tax</span>
              <span className="text-right">Amount</span>
              <span />
            </div>
            {lines.map((line, i) => (
              <div
                key={i}
                className="grid grid-cols-[minmax(220px,2fr)_90px_130px_90px_150px_110px_36px] items-start gap-2 rounded-md border p-2"
              >
                <div className="space-y-1.5">
                  <Select
                    value={line.productId ?? "custom"}
                    onValueChange={(v) => pickProduct(i, v)}
                  >
                    <SelectTrigger
                      size="sm"
                      className="w-full"
                      aria-label={`Line ${i + 1} product`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Custom item</SelectItem>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={line.description}
                    onChange={(e) => setLine(i, { description: e.target.value })}
                    placeholder="Description"
                    aria-label={`Line ${i + 1} description`}
                    required
                  />
                </div>
                <Input
                  value={line.quantity}
                  onChange={(e) => setLine(i, { quantity: e.target.value })}
                  inputMode="decimal"
                  className="text-right"
                  aria-label={`Line ${i + 1} quantity`}
                  required
                />
                <Input
                  value={line.unitPrice}
                  onChange={(e) => setLine(i, { unitPrice: e.target.value })}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="text-right"
                  aria-label={`Line ${i + 1} unit price`}
                  required
                />
                <Input
                  value={line.discountBps === 0 ? "" : line.discountBps / 100}
                  onChange={(e) => {
                    const pct = Number(e.target.value);
                    setLine(i, {
                      discountBps:
                        Number.isFinite(pct) && pct > 0
                          ? Math.min(10_000, Math.round(pct * 100))
                          : 0,
                    });
                  }}
                  inputMode="decimal"
                  placeholder="0"
                  className="text-right"
                  aria-label={`Line ${i + 1} discount percent`}
                />
                <Select
                  value={String(line.taxRateBps)}
                  onValueChange={(v) => setLine(i, { taxRateBps: Number(v) })}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-full"
                    aria-label={`Line ${i + 1} tax rate`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">No tax</SelectItem>
                    {taxRates
                      .filter((t) => t.rateBps > 0)
                      .map((t) => (
                        <SelectItem key={t.id} value={String(t.rateBps)}>
                          {t.name} ({(t.rateBps / 100).toFixed(2).replace(/\.?0+$/, "")}%)
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <div className="pt-1.5 text-right font-mono text-sm">
                  {money(preview.lineTotals[i]?.total)}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() =>
                    setLines((prev) =>
                      prev.length > 1 ? prev.filter((_, j) => j !== i) : prev,
                    )
                  }
                  disabled={lines.length === 1}
                  aria-label={`Remove line ${i + 1}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}
        >
          <Plus />
          Add line
        </Button>
      </fieldset>

      {/* ---- notes + totals ---- */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <fieldset className="space-y-4">
          <legend className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Notes & terms
          </legend>
          <div className="space-y-2">
            <Label htmlFor="inv-notes">Notes to the customer</Label>
            <Textarea
              id="inv-notes"
              name="notes"
              rows={3}
              placeholder="Thank you for your business."
              defaultValue={invoice?.notes ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-terms">Terms & conditions</Label>
            <Textarea
              id="inv-terms"
              name="terms"
              rows={3}
              placeholder="Payment due within the stated terms."
              defaultValue={invoice?.terms ?? ""}
            />
          </div>
        </fieldset>

        <div className="h-fit space-y-2 rounded-md border bg-muted/30 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-mono">
              {money(preview.totals?.subtotal)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Discount</span>
            <span className="font-mono">
              {preview.totals && !preview.totals.discountTotal.isZero()
                ? `−${preview.totals.discountTotal.toString()}`
                : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax</span>
            <span className="font-mono">{money(preview.totals?.taxTotal)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <span>Total</span>
            <span className="font-mono">{money(preview.totals?.total)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t pt-4">
        <Button type="submit" disabled={pending || !customerId}>
          {pending ? "Saving…" : editing ? "Save draft" : "Create draft"}
        </Button>
        <Button asChild type="button" variant="outline">
          <Link
            href={
              editing
                ? `/orgs/${organizationId}/invoices/${invoice!.id}`
                : `/orgs/${organizationId}/invoices`
            }
          >
            Cancel
          </Link>
        </Button>
        <p className="ml-auto text-xs text-muted-foreground">
          Drafts are fully editable — the number is assigned when you issue.
        </p>
      </div>
    </form>
  );
}
