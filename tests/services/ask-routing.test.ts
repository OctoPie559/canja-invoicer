import { describe, expect, it } from "vitest";
import {
  narrowExtraction,
  routerExtractionSchema,
  type RouterExtraction,
} from "@/lib/validation/ask";
import { resolvePeriod } from "@/lib/services/ask/dates";

/** Router output is re-validated server-side; date math never leaves code. */

const base: RouterExtraction = {
  intent: "financial_overview",
  customerRef: null,
  invoiceRef: null,
  period: null,
  from: null,
  to: null,
  metric: null,
  by: null,
  limit: null,
  reason: null,
};

describe("routerExtractionSchema (server-authoritative re-parse)", () => {
  it("accepts a valid extraction", () => {
    expect(routerExtractionSchema.safeParse(base).success).toBe(true);
  });

  it("rejects unknown intents", () => {
    expect(
      routerExtractionSchema.safeParse({ ...base, intent: "drop_tables" })
        .success,
    ).toBe(false);
  });

  it("rejects out-of-range limits and bad dates", () => {
    expect(
      routerExtractionSchema.safeParse({ ...base, limit: 999 }).success,
    ).toBe(false);
    expect(
      routerExtractionSchema.safeParse({ ...base, from: "July 4th" }).success,
    ).toBe(false);
  });
});

describe("narrowExtraction (per-intent params + honest degradation)", () => {
  it("degrades payment_status without an invoice ref to ambiguous", () => {
    expect(
      narrowExtraction({ ...base, intent: "payment_status" }),
    ).toEqual({ intent: "unsupported", params: { reason: "ambiguous" } });
  });

  it("revenue_by_period: missing period defaults to all_time; missing metric stays ambiguous", () => {
    expect(
      narrowExtraction({ ...base, intent: "revenue_by_period", metric: "invoiced" }),
    ).toEqual({
      intent: "revenue_by_period",
      params: { period: "all_time", metric: "invoiced" },
    });
    expect(
      narrowExtraction({
        ...base,
        intent: "revenue_by_period",
        period: "last_month",
      }),
    ).toEqual({ intent: "unsupported", params: { reason: "ambiguous" } });
  });

  it("builds an explicit range from from/to when no symbol is given", () => {
    expect(
      narrowExtraction({
        ...base,
        intent: "revenue_by_period",
        from: "2026-01-01",
        to: "2026-03-31",
        metric: "collected",
      }),
    ).toEqual({
      intent: "revenue_by_period",
      params: { period: { from: "2026-01-01", to: "2026-03-31" }, metric: "collected" },
    });
  });

  it("applies defaults (overdue limit, top_customers by/limit)", () => {
    expect(narrowExtraction({ ...base, intent: "overdue_list" })).toEqual({
      intent: "overdue_list",
      params: { limit: 10 },
    });
    expect(narrowExtraction({ ...base, intent: "top_customers" })).toEqual({
      intent: "top_customers",
      params: { by: "outstanding", limit: 5 },
    });
  });
});

describe("resolvePeriod (Africa/Nairobi, code-side date math)", () => {
  const noon = new Date("2026-07-17T12:00:00Z");

  it("this_month / last_month", () => {
    expect(resolvePeriod("this_month", noon)).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(resolvePeriod("last_month", noon)).toEqual({
      from: "2026-06-01",
      to: "2026-06-30",
    });
  });

  it("January edges roll into the previous year", () => {
    const jan = new Date("2026-01-15T12:00:00Z");
    expect(resolvePeriod("last_month", jan)).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(resolvePeriod("last_quarter", jan)).toEqual({
      from: "2025-10-01",
      to: "2025-12-31",
    });
  });

  it("quarters and years", () => {
    expect(resolvePeriod("this_quarter", noon)).toEqual({
      from: "2026-07-01",
      to: "2026-09-30",
    });
    expect(resolvePeriod("last_quarter", noon)).toEqual({
      from: "2026-04-01",
      to: "2026-06-30",
    });
    expect(resolvePeriod("last_year", noon)).toEqual({
      from: "2025-01-01",
      to: "2025-12-31",
    });
  });

  it("Nairobi is UTC+3: late-UTC June 30 is already July 1 locally", () => {
    const lateUtc = new Date("2026-06-30T21:30:00Z");
    expect(resolvePeriod("this_month", lateUtc)).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
  });

  it("all_time is unbounded; explicit ranges pass through", () => {
    expect(resolvePeriod("all_time", noon)).toEqual({ from: null, to: null });
    expect(
      resolvePeriod({ from: "2026-02-01", to: "2026-02-29" }, noon),
    ).toEqual({ from: "2026-02-01", to: "2026-02-29" });
  });
});
