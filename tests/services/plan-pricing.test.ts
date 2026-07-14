import { describe, expect, it } from "vitest";
import {
  BILLING_CURRENCY,
  billingPeriodEnd,
  proPrice,
} from "@/lib/authz/plan-pricing";

/**
 * Pro pricing + billing-period math (slice 8). Prices are placeholders but the
 * PERIOD arithmetic must be exact — a wrong period end over/under-charges the
 * customer or downgrades them early.
 */
describe("plan pricing (slice 8)", () => {
  it("prices Pro in the billing currency, minor units", () => {
    expect(BILLING_CURRENCY).toBe("KES");
    expect(proPrice("monthly").amountMinor).toBe(150_000n);
    expect(proPrice("annual").amountMinor).toBe(1_500_000n);
    // annual is cheaper than 12 months (a genuine discount)
    expect(proPrice("annual").amountMinor).toBeLessThan(
      proPrice("monthly").amountMinor * 12n,
    );
  });

  it("advances a monthly period by one calendar month", () => {
    const end = billingPeriodEnd(new Date("2026-01-15T00:00:00Z"), "monthly");
    expect(end.toISOString().slice(0, 10)).toBe("2026-02-15");
  });

  it("clamps a monthly period to the last valid day", () => {
    // Jan 31 + 1 month must not roll into March
    const end = billingPeriodEnd(new Date("2026-01-31T00:00:00Z"), "monthly");
    expect(end.toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("respects a leap February", () => {
    const end = billingPeriodEnd(new Date("2024-01-31T00:00:00Z"), "monthly");
    expect(end.toISOString().slice(0, 10)).toBe("2024-02-29");
  });

  it("advances an annual period by one year", () => {
    const end = billingPeriodEnd(new Date("2026-03-15T00:00:00Z"), "annual");
    expect(end.toISOString().slice(0, 10)).toBe("2027-03-15");
  });
});
