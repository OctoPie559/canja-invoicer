import { ValidationError } from "./errors";
import { Money } from "./money";
import type { InvoiceStatus } from "./invoice-status";

/**
 * Payment settlement math (brief §5.6). A payment is recorded exactly as
 * received — its own currency and amount — and, when that differs from the
 * invoice currency, converted through an explicit rate. Over-payment caused
 * by rate movement is stored as settlementDelta, never fudged into the
 * balance; under-payment simply leaves a residual balance (the org can
 * write it off with a credit note in slice 6).
 */

export interface SettlementInput {
  /** as received */
  amountMinor: bigint;
  currency: string;
  invoiceCurrency: string;
  /** payment currency → invoice currency; required iff currencies differ */
  fxRateUsed: string | null;
  /** invoice total minus amount already paid, in invoice currency */
  balanceDueMinor: bigint;
}

export interface Settlement {
  /** what this payment contributes, in invoice currency */
  amountInInvoiceCurrency: Money;
  /** overage beyond the balance due (≥ 0), recorded explicitly */
  settlementDelta: Money;
}

export function computeSettlement(input: SettlementInput): Settlement {
  if (input.amountMinor <= 0n) {
    throw new ValidationError("Payment amount must be greater than zero");
  }
  const received = Money.fromMinor(input.amountMinor, input.currency);
  const cross = input.currency !== input.invoiceCurrency;

  if (cross && !input.fxRateUsed) {
    throw new ValidationError(
      `An exchange rate is required to record a ${input.currency} payment against a ${input.invoiceCurrency} invoice`,
    );
  }
  if (!cross && input.fxRateUsed) {
    throw new ValidationError(
      "A same-currency payment does not take an exchange rate",
    );
  }

  const converted = cross
    ? received.convert(input.fxRateUsed!, input.invoiceCurrency)
    : received;
  if (converted.amountMinor <= 0n) {
    throw new ValidationError("Converted payment amount rounds to zero");
  }

  const balance = Money.fromMinor(
    input.balanceDueMinor < 0n ? 0n : input.balanceDueMinor,
    input.invoiceCurrency,
  );
  const over = converted.subtract(balance);
  return {
    amountInInvoiceCurrency: converted,
    settlementDelta: over.isNegative()
      ? Money.zero(input.invoiceCurrency)
      : over,
  };
}

/**
 * Status after money lands: full cover → paid, anything less → partial.
 * A payment on an overdue invoice moves it to partial — the overdue cron
 * re-marks it on its next run if a past-due balance remains, so "overdue"
 * always reflects the CURRENT truth rather than sticking forever.
 */
export function statusAfterPayment(
  amountPaidAfterMinor: bigint,
  totalMinor: bigint,
): Extract<InvoiceStatus, "partial" | "paid"> {
  return amountPaidAfterMinor >= totalMinor ? "paid" : "partial";
}
