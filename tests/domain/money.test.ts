import { describe, expect, it } from "vitest";
import { Money, sumMoney, currencyExponent } from "@/lib/domain/money";
import { MoneyError } from "@/lib/domain/errors";

describe("Money construction", () => {
  it("constructs from bigint minor units", () => {
    const m = Money.fromMinor(123456n, "KES");
    expect(m.amountMinor).toBe(123456n);
    expect(m.currency).toBe("KES");
  });

  it("rejects number amounts — floats are uncompilable by API design", () => {
    // @ts-expect-error amounts must be bigint
    expect(() => Money.fromMinor(1234.56, "KES")).toThrow(MoneyError);
    // @ts-expect-error amounts must be bigint
    expect(() => Money.fromMinor(1234, "KES")).toThrow(MoneyError);
  });

  it("rejects invalid currency codes", () => {
    expect(() => Money.fromMinor(1n, "kes")).toThrow(MoneyError);
    expect(() => Money.fromMinor(1n, "KESH")).toThrow(MoneyError);
    expect(() => Money.fromMinor(1n, "")).toThrow(MoneyError);
  });

  it("parses decimal strings to minor units", () => {
    expect(Money.parse("1234.56", "KES").amountMinor).toBe(123456n);
    expect(Money.parse("0.01", "USD").amountMinor).toBe(1n);
    expect(Money.parse("1500", "KES").amountMinor).toBe(150000n);
    expect(Money.parse("-45.30", "USD").amountMinor).toBe(-4530n);
    expect(Money.parse("7.5", "KES").amountMinor).toBe(750n);
  });

  it("respects zero-exponent currencies", () => {
    expect(Money.parse("5000", "UGX").amountMinor).toBe(5000n);
    expect(currencyExponent("UGX")).toBe(0);
    expect(currencyExponent("KES")).toBe(2);
  });

  it("rejects more decimal places than the currency allows", () => {
    expect(() => Money.parse("1.234", "KES")).toThrow(MoneyError);
    expect(() => Money.parse("1.5", "UGX")).toThrow(MoneyError);
  });

  it("rejects garbage and float-ish inputs", () => {
    expect(() => Money.parse("1,234.56", "KES")).toThrow(MoneyError);
    expect(() => Money.parse("1.2e3", "KES")).toThrow(MoneyError);
    expect(() => Money.parse("", "KES")).toThrow(MoneyError);
    expect(() => Money.parse("abc", "KES")).toThrow(MoneyError);
    // @ts-expect-error strings only
    expect(() => Money.parse(1234.56, "KES")).toThrow(MoneyError);
  });
});

describe("Money arithmetic", () => {
  it("adds and subtracts same-currency amounts exactly", () => {
    const a = Money.parse("0.10", "KES");
    const b = Money.parse("0.20", "KES");
    // the classic float failure 0.1 + 0.2 !== 0.3 cannot happen here
    expect(a.add(b).amountMinor).toBe(30n);
    expect(b.subtract(a).amountMinor).toBe(10n);
  });

  it("throws on cross-currency add/subtract/compare", () => {
    const kes = Money.parse("100", "KES");
    const usd = Money.parse("100", "USD");
    expect(() => kes.add(usd)).toThrow(MoneyError);
    expect(() => kes.subtract(usd)).toThrow(MoneyError);
    expect(() => kes.compare(usd)).toThrow(MoneyError);
  });

  it("multiplies by decimal quantities with half-away-from-zero rounding", () => {
    const unit = Money.parse("99.99", "KES");
    // 99.99 * 2.5 = 249.975 → 249.98 (round half up)
    expect(unit.multiplyByQuantity("2.5").amountMinor).toBe(24998n);
    // 3 decimal places allowed (numeric(12,3) quantities)
    expect(Money.parse("10.00", "KES").multiplyByQuantity("0.125").amountMinor).toBe(125n);
    // negative amounts round away from zero symmetrically
    expect(Money.parse("-99.99", "KES").multiplyByQuantity("2.5").amountMinor).toBe(-24998n);
  });

  it("rejects quantities with more than 3 decimal places or non-strings", () => {
    const m = Money.parse("10", "KES");
    expect(() => m.multiplyByQuantity("1.2345")).toThrow(MoneyError);
    // @ts-expect-error quantities are decimal strings
    expect(() => m.multiplyByQuantity(2.5)).toThrow(MoneyError);
  });

  it("applies basis points for tax math", () => {
    const net = Money.parse("1000.00", "KES");
    // 16% VAT = 1600 bps
    expect(net.applyBps(1600n).amountMinor).toBe(16000n);
    // rounding: 0.33 * 16% = 0.0528 → 0.05
    expect(Money.parse("0.33", "KES").applyBps(1600n).amountMinor).toBe(5n);
    // half rounds up: 0.25 * 2% = 0.005 → 0.01
    expect(Money.parse("0.25", "KES").applyBps(200n).amountMinor).toBe(1n);
  });

  it("rejects negative or non-bigint basis points", () => {
    const m = Money.parse("10", "KES");
    expect(() => m.applyBps(-1n)).toThrow(MoneyError);
    // @ts-expect-error bps are bigint
    expect(() => m.applyBps(1600)).toThrow(MoneyError);
  });

  it("sums a list in one currency and rejects mixed lists", () => {
    const values = [Money.parse("10.50", "KES"), Money.parse("4.50", "KES")];
    expect(sumMoney(values, "KES").amountMinor).toBe(1500n);
    expect(sumMoney([], "KES").amountMinor).toBe(0n);
    expect(() =>
      sumMoney([Money.parse("1", "USD")], "KES"),
    ).toThrow(MoneyError);
  });
});

describe("Money FX conversion", () => {
  it("converts using a stored rate, rounding once at the end", () => {
    // USD 100.00 at 129.5321 KES/USD = KES 12953.21
    const usd = Money.parse("100.00", "USD");
    expect(usd.convert("129.5321", "KES").equals(Money.parse("12953.21", "KES"))).toBe(true);
  });

  it("handles differing minor-unit exponents", () => {
    // KES 1000.00 at 28.9 UGX/KES → UGX 28900 (0-exponent target)
    const kes = Money.parse("1000.00", "KES");
    expect(kes.convert("28.9", "UGX").amountMinor).toBe(28900n);
    // UGX 5000 at 0.0346 KES/UGX → KES 173.00
    const ugx = Money.parse("5000", "UGX");
    expect(ugx.convert("0.0346", "KES").amountMinor).toBe(17300n);
  });

  it("rounds conversion half away from zero", () => {
    // 0.01 USD * 129.995 = 1.29995 KES-cents... : 1 cent * 1.29995 = 1.29995 → 1
    expect(Money.parse("0.01", "USD").convert("1.2999500", "KES").amountMinor).toBe(1n);
    // exactly half: 1 cent * 1.5 = 1.5 → 2
    expect(Money.parse("0.01", "USD").convert("1.5", "KES").amountMinor).toBe(2n);
    expect(Money.parse("-0.01", "USD").convert("1.5", "KES").amountMinor).toBe(-2n);
  });

  it("rejects non-positive or malformed rates", () => {
    const m = Money.parse("1", "USD");
    expect(() => m.convert("0", "KES")).toThrow(MoneyError);
    expect(() => m.convert("-1.5", "KES")).toThrow(MoneyError);
    expect(() => m.convert("1.123456789", "KES")).toThrow(MoneyError); // > 8 dp
    // @ts-expect-error rates are decimal strings
    expect(() => m.convert(129.53, "KES")).toThrow(MoneyError);
  });
});

describe("Money formatting", () => {
  it("renders decimal strings with full currency precision", () => {
    expect(Money.fromMinor(123456n, "KES").toDecimalString()).toBe("1234.56");
    expect(Money.fromMinor(-4530n, "USD").toDecimalString()).toBe("-45.30");
    expect(Money.fromMinor(5n, "KES").toDecimalString()).toBe("0.05");
    expect(Money.fromMinor(5000n, "UGX").toDecimalString()).toBe("5000");
    expect(Money.fromMinor(150000n, "KES").toString()).toBe("KES 1500.00");
  });

  it("round-trips parse → minor → decimal string", () => {
    for (const s of ["0.01", "1234.56", "-99.99", "0.00"]) {
      expect(Money.parse(s, "KES").toDecimalString()).toBe(
        s === "0.00" ? "0.00" : s,
      );
    }
  });
});
