"use client";

import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  computeInvoiceTotals,
  computeLine,
  type InvoiceTotals,
  type LineTotals,
} from "@/lib/domain/invoice-math";
import { Money } from "@/lib/domain/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * The document line grid shared by the invoice and estimate builders.
 * Live totals run the SAME domain math module the services use, so the
 * preview can never disagree with what the server stores.
 */

export interface EditorLine {
  productId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discountBps: number;
  taxRateBps: number;
}

export function usePreviewTotals(lines: EditorLine[], currency: string) {
  return useMemo(() => {
    const lineTotals: Array<LineTotals | null> = lines.map((l) => {
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
    let totals: InvoiceTotals | null = null;
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
      // some line is incomplete — footer shows dashes
    }
    return { lineTotals, totals };
  }, [lines, currency]);
}

export function LineItemsEditor({
  lines,
  onLinesChange,
  products,
  taxRates,
  currency,
  defaultTaxRateBps = 0,
}: {
  lines: EditorLine[];
  onLinesChange: (lines: EditorLine[]) => void;
  products: Array<{
    id: string;
    name: string;
    unitPrice: string;
    currency: string;
    defaultTaxRateBps: number | null;
  }>;
  taxRates: Array<{ id: string; name: string; rateBps: number }>;
  currency: string;
  defaultTaxRateBps?: number;
}) {
  const preview = usePreviewTotals(lines, currency);
  const money = (m: { toString(): string } | null | undefined) =>
    m ? m.toString() : "—";

  const setLine = (index: number, patch: Partial<EditorLine>) =>
    onLinesChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));

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
      // autofill the price only when the catalog price is in this
      // document's currency — cross-currency prices need a human decision
      ...(product.currency === currency ? { unitPrice: product.unitPrice } : {}),
      ...(product.defaultTaxRateBps !== null
        ? { taxRateBps: product.defaultTaxRateBps }
        : {}),
    });
  };

  return (
    <div className="space-y-3">
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
                  onLinesChange(
                    lines.length > 1 ? lines.filter((_, j) => j !== i) : lines,
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
        onClick={() =>
          onLinesChange([
            ...lines,
            {
              productId: null,
              description: "",
              quantity: "1",
              unitPrice: "",
              discountBps: 0,
              taxRateBps: defaultTaxRateBps,
            },
          ])
        }
      >
        <Plus />
        Add line
      </Button>
    </div>
  );
}

/** Shared totals footer for the builder forms. */
export function TotalsPreview({
  totals,
}: {
  totals: InvoiceTotals | null;
}) {
  const money = (m: { toString(): string } | null | undefined) =>
    m ? m.toString() : "—";
  return (
    <div className="h-fit space-y-2 rounded-md border bg-muted/30 p-4 text-sm">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="font-mono">{money(totals?.subtotal)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Discount</span>
        <span className="font-mono">
          {totals && !totals.discountTotal.isZero()
            ? `−${totals.discountTotal.toString()}`
            : "—"}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Tax</span>
        <span className="font-mono">{money(totals?.taxTotal)}</span>
      </div>
      <div className="flex justify-between border-t pt-2 text-base font-semibold">
        <span>Total</span>
        <span className="font-mono">{money(totals?.total)}</span>
      </div>
    </div>
  );
}
