import { describe, expect, it } from "vitest";
import {
  dueDateFor,
  PAYMENT_TERMS_PRESETS,
  paymentTermsLabel,
} from "@/lib/domain/payment-terms";

describe("payment terms", () => {
  it("labels presets by name and everything else as Net N", () => {
    expect(paymentTermsLabel(0)).toBe("Due on receipt");
    expect(paymentTermsLabel(30)).toBe("Net 30");
    expect(paymentTermsLabel(23)).toBe("Net 23");
  });

  it("computes due dates across month and year boundaries", () => {
    expect(dueDateFor("2026-07-07", 0)).toBe("2026-07-07");
    expect(dueDateFor("2026-07-07", 30)).toBe("2026-08-06");
    expect(dueDateFor("2026-12-15", 30)).toBe("2027-01-14");
    // leap-year February
    expect(dueDateFor("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("presets are unique and ascending", () => {
    const days = PAYMENT_TERMS_PRESETS.map((p) => p.days);
    expect(new Set(days).size).toBe(days.length);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
  });
});
