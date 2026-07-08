"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  createCreditNoteAction,
  updateCreditNoteAction,
} from "@/app/actions/credit-notes";
import type { ActionState } from "@/app/actions/organizations";
import { computeInvoiceTotals } from "@/lib/domain/invoice-math";
import { Money } from "@/lib/domain/money";
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
 * Credit-note builder: lines carry no percentage discount (the credit IS
 * the adjustment); currency is fixed to the invoice's. The creditable
 * headroom shown here is UX — the service re-checks at create and issue.
 */

interface CnLine {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRateBps: number;
}

export function CreditNoteForm({
  organizationId,
  invoiceId,
  invoiceNumber,
  currency,
  creditableLabel,
  taxRates,
  creditNote,
  prefillLines,
}: {
  organizationId: string;
  invoiceId: string;
  invoiceNumber: string;
  currency: string;
  creditableLabel: string;
  taxRates: Array<{ id: string; name: string; rateBps: number }>;
  creditNote?: {
    id: string;
    version: number;
    reason: string | null;
    lines: CnLine[];
  };
  /** invoice lines offered as a starting point on create */
  prefillLines?: CnLine[];
}) {
  const editing = Boolean(creditNote);
  const [lines, setLines] = useState<CnLine[]>(
    creditNote?.lines.length
      ? creditNote.lines
      : (prefillLines ?? [
          { description: "", quantity: "1", unitPrice: "", taxRateBps: 0 },
        ]),
  );
  const [state, action, pending] = useActionState<ActionState, FormData>(
    editing
      ? updateCreditNoteAction.bind(null, organizationId)
      : createCreditNoteAction.bind(null, organizationId),
    { error: null },
  );

  const preview = (() => {
    try {
      return computeInvoiceTotals(
        lines.map((l) => ({
          quantity: l.quantity,
          unitPriceMinor: Money.parse(l.unitPrice, currency).amountMinor,
          discountBps: 0,
          taxRateBps: l.taxRateBps,
        })),
        currency,
      );
    } catch {
      return null;
    }
  })();

  const setLine = (i: number, patch: Partial<CnLine>) =>
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <form action={action} className="space-y-6">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {editing ? (
        <>
          <input type="hidden" name="id" value={creditNote!.id} />
          <input type="hidden" name="version" value={creditNote!.version} />
        </>
      ) : (
        <input type="hidden" name="invoiceId" value={invoiceId} />
      )}
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />

      <p className="text-sm text-muted-foreground">
        Crediting <span className="font-mono font-medium">{invoiceNumber}</span>{" "}
        — creditable balance{" "}
        <span className="font-mono font-medium">{creditableLabel}</span>.
      </p>

      <div className="space-y-2">
        {lines.map((line, i) => (
          <div
            key={i}
            className="grid grid-cols-[minmax(200px,2fr)_90px_130px_150px_36px] items-center gap-2 rounded-md border p-2"
          >
            <Input
              value={line.description}
              onChange={(e) => setLine(i, { description: e.target.value })}
              placeholder="What is being credited"
              required
            />
            <Input
              value={line.quantity}
              onChange={(e) => setLine(i, { quantity: e.target.value })}
              inputMode="decimal"
              className="text-right"
              required
            />
            <Input
              value={line.unitPrice}
              onChange={(e) => setLine(i, { unitPrice: e.target.value })}
              inputMode="decimal"
              placeholder="0.00"
              className="text-right"
              required
            />
            <Select
              value={String(line.taxRateBps)}
              onValueChange={(v) => setLine(i, { taxRateBps: Number(v) })}
            >
              <SelectTrigger size="sm" className="w-full">
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setLines((prev) => [
              ...prev,
              { description: "", quantity: "1", unitPrice: "", taxRateBps: 0 },
            ])
          }
        >
          <Plus />
          Add line
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-2">
          <Label htmlFor="cn-reason">Reason</Label>
          <Textarea
            id="cn-reason"
            name="reason"
            rows={2}
            placeholder="e.g. Over-billed hours on INV-000012"
            defaultValue={creditNote?.reason ?? ""}
          />
        </div>
        <div className="h-fit space-y-2 rounded-md border bg-muted/30 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-mono">
              {preview ? preview.subtotal.toString() : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax</span>
            <span className="font-mono">
              {preview ? preview.taxTotal.toString() : "—"}
            </span>
          </div>
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span>Credit total</span>
            <span className="font-mono">
              {preview ? preview.total.toString() : "—"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save draft" : "Create draft"}
        </Button>
        <Button asChild type="button" variant="outline">
          <Link
            href={
              editing
                ? `/orgs/${organizationId}/credit-notes/${creditNote!.id}`
                : `/orgs/${organizationId}/invoices/${invoiceId}`
            }
          >
            Cancel
          </Link>
        </Button>
      </div>
    </form>
  );
}
