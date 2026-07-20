import { Money } from "@/lib/domain/money";

/**
 * Pro plan pricing for self-billing (PROJECT_BRIEF.md §3.8: monthly, with a
 * discounted annual option, collected through the Kenya-native rail). Amounts
 * are PLACEHOLDERS pending pricing validation (brief §10) — changing them is a
 * config edit here, exactly like the entitlement caps next door. Priced in the
 * platform's own billing currency (KES), independent of any org's base
 * currency.
 */

export const BILLING_CURRENCY = "KES";

export const BILLING_INTERVALS = ["monthly", "annual"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** Price per interval, in KES minor units. Annual ≈ two months free. */
const PRO_PRICE_MINOR: Record<BillingInterval, bigint> = {
  monthly: 150_000n, // KES 1,500.00
  annual: 1_500_000n, // KES 15,000.00
};

export function proPrice(interval: BillingInterval): Money {
  return Money.fromMinor(PRO_PRICE_MINOR[interval], BILLING_CURRENCY);
}

/**
 * Paystack plan code for an interval (wave 6). Created once in the Paystack
 * dashboard and referenced by env, so passing it in `transaction/initialize`
 * makes the first card charge auto-create a recurring subscription. Null when
 * unset — checkout then falls back to a one-off charge (today's behavior), so
 * recurring is a config-gated upgrade, never a hard dependency.
 */
export function proPlanCode(interval: BillingInterval): string | null {
  const code =
    interval === "annual"
      ? process.env.PAYSTACK_PLAN_ANNUAL
      : process.env.PAYSTACK_PLAN_MONTHLY;
  return code && code.trim() !== "" ? code : null;
}

/**
 * The end of a billing period starting at `start`, in UTC. Month arithmetic
 * clamps to the last valid day (Jan 31 + 1 month → Feb 28/29) so a period end
 * never silently rolls into the following month.
 */
export function billingPeriodEnd(start: Date, interval: BillingInterval): Date {
  const d = new Date(start.getTime());
  if (interval === "annual") {
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    return d;
  }
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}
