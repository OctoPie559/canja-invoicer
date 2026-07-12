import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/domain/errors";
import {
  assertRecurringTransition,
  canRecurringTransition,
  computeNextRun,
  isDue,
  reachedEnd,
  type RecurringStatus,
} from "@/lib/domain/recurring-schedule";

const d = (iso: string) => new Date(iso);

describe("computeNextRun", () => {
  it("weekly advances by 7 × interval days", () => {
    expect(computeNextRun(d("2026-07-01T00:00:00Z"), "weekly", 1).toISOString())
      .toBe("2026-07-08T00:00:00.000Z");
    expect(computeNextRun(d("2026-07-01T00:00:00Z"), "weekly", 2).toISOString())
      .toBe("2026-07-15T00:00:00.000Z");
  });

  it("monthly/quarterly/yearly advance by months", () => {
    expect(computeNextRun(d("2026-01-15T00:00:00Z"), "monthly", 1).toISOString())
      .toBe("2026-02-15T00:00:00.000Z");
    expect(computeNextRun(d("2026-01-15T00:00:00Z"), "quarterly", 1).toISOString())
      .toBe("2026-04-15T00:00:00.000Z");
    expect(computeNextRun(d("2026-01-15T00:00:00Z"), "yearly", 1).toISOString())
      .toBe("2027-01-15T00:00:00.000Z");
  });

  it("clamps to the last day of a shorter month (31 Jan → 28/29 Feb)", () => {
    // non-leap 2026
    expect(computeNextRun(d("2026-01-31T00:00:00Z"), "monthly", 1).toISOString())
      .toBe("2026-02-28T00:00:00.000Z");
    // leap 2028
    expect(computeNextRun(d("2028-01-31T00:00:00Z"), "monthly", 1).toISOString())
      .toBe("2028-02-29T00:00:00.000Z");
    // never rolls into March
    expect(computeNextRun(d("2026-08-31T00:00:00Z"), "monthly", 6).toISOString())
      .toBe("2027-02-28T00:00:00.000Z");
  });

  it("rejects a non-positive interval", () => {
    expect(() => computeNextRun(d("2026-07-01T00:00:00Z"), "weekly", 0)).toThrow(
      ValidationError,
    );
  });
});

describe("isDue / reachedEnd", () => {
  const base = {
    status: "active" as RecurringStatus,
    nextRunAt: d("2026-07-01T00:00:00Z"),
    endDate: null as string | null,
  };
  it("fires only when active and the run time has arrived", () => {
    expect(isDue(base, d("2026-07-01T00:00:00Z"))).toBe(true);
    expect(isDue(base, d("2026-06-30T23:59:00Z"))).toBe(false);
    expect(isDue({ ...base, status: "paused" }, d("2026-07-02T00:00:00Z"))).toBe(false);
    expect(isDue({ ...base, nextRunAt: null }, d("2026-07-02T00:00:00Z"))).toBe(false);
  });
  it("does not fire past the end date", () => {
    expect(isDue({ ...base, endDate: "2026-06-30" }, d("2026-07-02T00:00:00Z"))).toBe(false);
    expect(isDue({ ...base, endDate: "2026-07-31" }, d("2026-07-01T00:00:00Z"))).toBe(true);
  });
  it("reachedEnd is true once the next run passes the end date", () => {
    expect(reachedEnd(d("2026-08-01T00:00:00Z"), "2026-07-31")).toBe(true);
    expect(reachedEnd(d("2026-07-15T00:00:00Z"), "2026-07-31")).toBe(false);
    expect(reachedEnd(d("2026-08-01T00:00:00Z"), null)).toBe(false);
  });
});

describe("status machine", () => {
  it("allows active↔paused and →ended; ended is terminal", () => {
    expect(canRecurringTransition("active", "paused")).toBe(true);
    expect(canRecurringTransition("paused", "active")).toBe(true);
    expect(canRecurringTransition("active", "ended")).toBe(true);
    expect(canRecurringTransition("paused", "ended")).toBe(true);
    expect(canRecurringTransition("ended", "active")).toBe(false);
    expect(() => assertRecurringTransition("ended", "active")).toThrow(ValidationError);
  });
});
