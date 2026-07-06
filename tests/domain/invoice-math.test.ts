import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/domain/errors";
import {
  computeInvoiceTotals,
  computeLine,
  type LineInput,
} from "@/lib/domain/invoice-math";

const line = (overrides: Partial<LineInput> = {}): LineInput => ({
  quantity: "1",
  unitPriceMinor: 100_00n, // KES 100.00
  discountBps: 0,
  taxRateBps: 0,
  ...overrides,
});

describe("computeLine", () => {
  it("computes a plain line: qty × unit price", () => {
    const t = computeLine(line({ quantity: "3" }), "KES");
    expect(t.gross.amountMinor).toBe(300_00n);
    expect(t.discount.amountMinor).toBe(0n);
    expect(t.tax.amountMinor).toBe(0n);
    expect(t.total.amountMinor).toBe(300_00n);
  });

  it("supports fractional quantities to 3 dp (hours, kgs)", () => {
    // 2.5 h × 1,500.00 = 3,750.00
    const t = computeLine(
      line({ quantity: "2.5", unitPriceMinor: 1500_00n }),
      "KES",
    );
    expect(t.total.amountMinor).toBe(3750_00n);
  });

  it("rounds half away from zero once per component", () => {
    // 0.333 × 100.00 = 33.30 exactly; 1.5 × 33.33 = 49.995 → 50.00
    const a = computeLine(
      line({ quantity: "0.333", unitPriceMinor: 100_00n }),
      "KES",
    );
    expect(a.gross.amountMinor).toBe(33_30n);
    const b = computeLine(
      line({ quantity: "1.5", unitPriceMinor: 33_33n }),
      "KES",
    );
    expect(b.gross.amountMinor).toBe(50_00n);
  });

  it("applies discount before tax (tax on the discounted base)", () => {
    // 1,000.00 − 10% = 900.00; VAT 16% on 900.00 = 144.00; total 1,044.00
    const t = computeLine(
      line({
        unitPriceMinor: 1000_00n,
        discountBps: 1000,
        taxRateBps: 1600,
      }),
      "KES",
    );
    expect(t.gross.amountMinor).toBe(1000_00n);
    expect(t.discount.amountMinor).toBe(100_00n);
    expect(t.tax.amountMinor).toBe(144_00n);
    expect(t.total.amountMinor).toBe(1044_00n);
  });

  it("100% discount produces a zero total, tax included", () => {
    const t = computeLine(
      line({ discountBps: 10_000, taxRateBps: 1600 }),
      "KES",
    );
    expect(t.discount.amountMinor).toBe(100_00n);
    expect(t.tax.amountMinor).toBe(0n);
    expect(t.total.amountMinor).toBe(0n);
  });

  it("handles zero-exponent currencies (UGX has no cents)", () => {
    const t = computeLine(
      line({ quantity: "3", unitPriceMinor: 1000n, taxRateBps: 1800 }),
      "UGX",
    );
    expect(t.gross.amountMinor).toBe(3000n);
    expect(t.tax.amountMinor).toBe(540n);
    expect(t.total.amountMinor).toBe(3540n);
  });

  it("rejects negative prices, bad bps, and negative quantities", () => {
    expect(() =>
      computeLine(line({ unitPriceMinor: -1n }), "KES"),
    ).toThrow(ValidationError);
    expect(() => computeLine(line({ discountBps: 10_001 }), "KES")).toThrow(
      ValidationError,
    );
    expect(() => computeLine(line({ discountBps: -1 }), "KES")).toThrow(
      ValidationError,
    );
    expect(() => computeLine(line({ taxRateBps: 10_001 }), "KES")).toThrow(
      ValidationError,
    );
    expect(() => computeLine(line({ discountBps: 2.5 }), "KES")).toThrow(
      ValidationError,
    );
    expect(() => computeLine(line({ quantity: "-1" }), "KES")).toThrow(
      ValidationError,
    );
  });
});

describe("computeInvoiceTotals", () => {
  it("totals are exact sums of the rounded lines", () => {
    // three lines engineered so per-line rounding matters:
    // 0.333 × 100.00 = 33.30; ×3 lines = 99.90 — NOT 0.999 × 100 = 99.90 either
    // but with tax: per-line VAT on 33.30 = 5.328 → 5.33; ×3 = 15.99
    // (document-level VAT on 99.90 would be 15.98 — we assert line-sum wins)
    const lines = Array.from({ length: 3 }, () =>
      line({ quantity: "0.333", unitPriceMinor: 100_00n, taxRateBps: 1600 }),
    );
    const t = computeInvoiceTotals(lines, "KES");
    expect(t.subtotal.amountMinor).toBe(99_90n);
    expect(t.taxTotal.amountMinor).toBe(15_99n);
    expect(t.total.amountMinor).toBe(115_89n);
    // invariant: total = subtotal − discounts + tax
    expect(
      t.subtotal.subtract(t.discountTotal).add(t.taxTotal).amountMinor,
    ).toBe(t.total.amountMinor);
  });

  it("mixed lines: discounts and multiple tax rates", () => {
    const t = computeInvoiceTotals(
      [
        // 2 × 500.00 = 1,000.00, 5% off → 950.00, VAT 16% → 152.00 ⇒ 1,102.00
        line({
          quantity: "2",
          unitPriceMinor: 500_00n,
          discountBps: 500,
          taxRateBps: 1600,
        }),
        // 1 × 200.00, exempt ⇒ 200.00
        line({ unitPriceMinor: 200_00n }),
      ],
      "KES",
    );
    expect(t.subtotal.amountMinor).toBe(1200_00n);
    expect(t.discountTotal.amountMinor).toBe(50_00n);
    expect(t.taxTotal.amountMinor).toBe(152_00n);
    expect(t.total.amountMinor).toBe(1302_00n);
  });

  it("rejects an empty invoice", () => {
    expect(() => computeInvoiceTotals([], "KES")).toThrow(ValidationError);
  });
});
