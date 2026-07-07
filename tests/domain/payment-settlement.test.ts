import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/domain/errors";
import {
  computeSettlement,
  statusAfterPayment,
} from "@/lib/domain/payment-settlement";

describe("computeSettlement", () => {
  it("same currency passes through with zero delta", () => {
    const s = computeSettlement({
      amountMinor: 50_000n,
      currency: "KES",
      invoiceCurrency: "KES",
      fxRateUsed: null,
      balanceDueMinor: 100_000n,
    });
    expect(s.amountInInvoiceCurrency.amountMinor).toBe(50_000n);
    expect(s.settlementDelta.isZero()).toBe(true);
  });

  it("cross-currency converts through the stored rate (KES on a USD invoice)", () => {
    // KES 130,000.00 at 1 KES = 0.00771605 USD → USD 1,003.09 (rounded)
    const s = computeSettlement({
      amountMinor: 13_000_000n,
      currency: "KES",
      invoiceCurrency: "USD",
      fxRateUsed: "0.00771605",
      balanceDueMinor: 100_000n, // USD 1,000.00 due
    });
    expect(s.amountInInvoiceCurrency.currency).toBe("USD");
    expect(s.amountInInvoiceCurrency.amountMinor).toBe(100_309n);
    // overage from rate movement is explicit, never fudged
    expect(s.settlementDelta.amountMinor).toBe(309n);
  });

  it("under-payment leaves a residual balance with zero delta", () => {
    const s = computeSettlement({
      amountMinor: 9_000_000n, // KES 90,000
      currency: "KES",
      invoiceCurrency: "USD",
      fxRateUsed: "0.00771605",
      balanceDueMinor: 100_000n,
    });
    expect(s.amountInInvoiceCurrency.amountMinor).toBe(69_444n);
    expect(s.settlementDelta.isZero()).toBe(true);
  });

  it("rate required iff currencies differ; positive amounts only", () => {
    expect(() =>
      computeSettlement({
        amountMinor: 100n,
        currency: "KES",
        invoiceCurrency: "USD",
        fxRateUsed: null,
        balanceDueMinor: 100n,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      computeSettlement({
        amountMinor: 100n,
        currency: "KES",
        invoiceCurrency: "KES",
        fxRateUsed: "1.0",
        balanceDueMinor: 100n,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      computeSettlement({
        amountMinor: 0n,
        currency: "KES",
        invoiceCurrency: "KES",
        fxRateUsed: null,
        balanceDueMinor: 100n,
      }),
    ).toThrow(ValidationError);
  });
});

describe("statusAfterPayment", () => {
  it("full cover → paid, partial cover → partial, overpay → paid", () => {
    expect(statusAfterPayment(100n, 100n)).toBe("paid");
    expect(statusAfterPayment(150n, 100n)).toBe("paid");
    expect(statusAfterPayment(99n, 100n)).toBe("partial");
  });
});
