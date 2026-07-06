import { ValidationError } from "./errors";
import { Money } from "./money";

/**
 * Invoice line and document math (brief §104, §5.2). Pure bigint arithmetic
 * through the Money value object — no floats anywhere. Each line rounds
 * half away from zero ONCE per component (gross, discount, tax); document
 * totals are exact sums of the rounded lines, so the invoice always equals
 * the sum of what each line displays.
 *
 * Per line:
 *   gross    = unitPrice × quantity
 *   discount = gross × discountBps / 10_000
 *   taxable  = gross − discount
 *   tax      = taxable × taxRateBps / 10_000   (tax on the discounted base)
 *   total    = taxable + tax
 */

export interface LineInput {
  /** Decimal string, up to 3 dp — matches numeric(12,3) quantity columns. */
  quantity: string;
  /** Unit price in minor units of the invoice currency. */
  unitPriceMinor: bigint;
  /** Percentage discount in basis points (0–10000). */
  discountBps: number;
  /** Tax rate in basis points (0–10000), copied from tax_rates at edit time. */
  taxRateBps: number;
}

export interface LineTotals {
  gross: Money;
  discount: Money;
  tax: Money;
  total: Money;
}

export interface InvoiceTotals {
  subtotal: Money;
  discountTotal: Money;
  taxTotal: Money;
  total: Money;
}

const BPS_MAX = 10_000;

function assertBps(value: number, what: string): void {
  if (!Number.isInteger(value) || value < 0 || value > BPS_MAX) {
    throw new ValidationError(
      `${what} must be an integer between 0 and ${BPS_MAX} basis points`,
    );
  }
}

export function computeLine(line: LineInput, currency: string): LineTotals {
  assertBps(line.discountBps, "Discount");
  assertBps(line.taxRateBps, "Tax rate");
  if (line.unitPriceMinor < 0n) {
    throw new ValidationError("Unit price cannot be negative");
  }

  const unitPrice = Money.fromMinor(line.unitPriceMinor, currency);
  const gross = unitPrice.multiplyByQuantity(line.quantity);
  if (gross.isNegative()) {
    throw new ValidationError("Line quantity cannot be negative");
  }
  const discount = gross.applyBps(BigInt(line.discountBps));
  const taxable = gross.subtract(discount);
  const tax = taxable.applyBps(BigInt(line.taxRateBps));
  return { gross, discount, tax, total: taxable.add(tax) };
}

/**
 * Document totals as exact sums of the per-line rounded components. An
 * invoice needs at least one line to mean anything; empty input is a
 * caller bug surfaced as a validation error.
 */
export function computeInvoiceTotals(
  lines: LineInput[],
  currency: string,
): InvoiceTotals {
  if (lines.length === 0) {
    throw new ValidationError("An invoice needs at least one line item");
  }
  let subtotal = Money.zero(currency);
  let discountTotal = Money.zero(currency);
  let taxTotal = Money.zero(currency);
  let total = Money.zero(currency);
  for (const line of lines) {
    const t = computeLine(line, currency);
    subtotal = subtotal.add(t.gross);
    discountTotal = discountTotal.add(t.discount);
    taxTotal = taxTotal.add(t.tax);
    total = total.add(t.total);
  }
  return { subtotal, discountTotal, taxTotal, total };
}
