import { MoneyError } from "./errors";

/**
 * Money value object — the only way money moves through this codebase.
 *
 * Invariants (PROJECT_BRIEF.md §5.2):
 * - Amounts are bigint minor units (cents), never floats. There is no API
 *   that accepts a `number` for an amount.
 * - Every amount carries its currency; arithmetic across currencies throws.
 *   Cross-currency aggregation happens only via convert() with a stored rate.
 * - Rounding is half away from zero, applied once at the end of an operation.
 */

/** ISO 4217 minor-unit exponents. Currencies not listed default to 2. */
const CURRENCY_EXPONENTS: Record<string, number> = {
  KES: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  TZS: 2,
  UGX: 0,
  RWF: 0,
  JPY: 0,
  BHD: 3,
  KWD: 3,
};

const CURRENCY_CODE = /^[A-Z]{3}$/;
const DECIMAL_STRING = /^-?\d+(\.\d+)?$/;

/** Scale factor used for FX rates: rates carry up to 8 decimal places. */
const RATE_DECIMALS = 8;

export function currencyExponent(currency: string): number {
  return CURRENCY_EXPONENTS[currency] ?? 2;
}

function assertCurrency(currency: string): void {
  if (!CURRENCY_CODE.test(currency)) {
    throw new MoneyError(`Invalid currency code: ${currency}`);
  }
}

function pow10(n: number): bigint {
  return 10n ** BigInt(n);
}

/**
 * Parse a decimal string into an integer scaled by 10^scale, rejecting more
 * fractional digits than `scale` allows. "12.5" @ scale 3 → 12500n.
 */
function parseScaled(input: string, scale: number, what: string): bigint {
  if (typeof input !== "string" || !DECIMAL_STRING.test(input)) {
    throw new MoneyError(`Invalid ${what}: expected a decimal string, got ${JSON.stringify(input)}`);
  }
  const negative = input.startsWith("-");
  const digits = negative ? input.slice(1) : input;
  const [whole, frac = ""] = digits.split(".");
  if (frac.length > scale) {
    throw new MoneyError(`Invalid ${what}: at most ${scale} decimal places allowed, got "${input}"`);
  }
  const scaled = BigInt(whole) * pow10(scale) + BigInt(frac.padEnd(scale, "0"));
  return negative ? -scaled : scaled;
}

/** Divide with rounding half away from zero. */
function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new MoneyError("Internal: division by non-positive denominator");
  }
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const quotient = abs / denominator;
  const remainder = abs % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

export class Money {
  readonly amountMinor: bigint;
  readonly currency: string;

  private constructor(amountMinor: bigint, currency: string) {
    this.amountMinor = amountMinor;
    this.currency = currency;
  }

  /** Construct from integer minor units (the DB representation). */
  static fromMinor(amountMinor: bigint, currency: string): Money {
    assertCurrency(currency);
    if (typeof amountMinor !== "bigint") {
      throw new MoneyError("Amounts must be bigint minor units, never number");
    }
    return new Money(amountMinor, currency);
  }

  /** Parse user input like "1234.56" into minor units. Strings only. */
  static parse(input: string, currency: string): Money {
    assertCurrency(currency);
    const minor = parseScaled(input, currencyExponent(currency), "amount");
    return new Money(minor, currency);
  }

  static zero(currency: string): Money {
    assertCurrency(currency);
    return new Money(0n, currency);
  }

  private assertSameCurrency(other: Money, op: string): void {
    if (this.currency !== other.currency) {
      throw new MoneyError(
        `Cannot ${op} ${this.currency} and ${other.currency}; convert through a stored FX rate first`,
      );
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other, "add");
    return new Money(this.amountMinor + other.amountMinor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other, "subtract");
    return new Money(this.amountMinor - other.amountMinor, this.currency);
  }

  negate(): Money {
    return new Money(-this.amountMinor, this.currency);
  }

  /**
   * Multiply by a quantity given as a decimal string with up to 3 decimal
   * places (matches the numeric(12,3) quantity columns). Result is rounded
   * half away from zero to minor units.
   */
  multiplyByQuantity(quantity: string): Money {
    const qScaled = parseScaled(quantity, 3, "quantity");
    return new Money(
      divideRounded(this.amountMinor * qScaled, pow10(3)),
      this.currency,
    );
  }

  /**
   * Apply a rate expressed in basis points (1600 bps = 16.00%): the tax and
   * percentage-discount primitive. Returns the computed portion, rounded.
   */
  applyBps(bps: bigint): Money {
    if (typeof bps !== "bigint" || bps < 0n) {
      throw new MoneyError("Basis points must be a non-negative bigint");
    }
    return new Money(
      divideRounded(this.amountMinor * bps, 10_000n),
      this.currency,
    );
  }

  /**
   * Convert to another currency using a stored FX rate (decimal string, up to
   * 8 dp): the ONLY way money crosses currencies. Handles differing
   * minor-unit exponents; rounds half away from zero once, at the end.
   */
  convert(rate: string, targetCurrency: string): Money {
    assertCurrency(targetCurrency);
    const rateScaled = parseScaled(rate, RATE_DECIMALS, "FX rate");
    if (rateScaled <= 0n) {
      throw new MoneyError("FX rate must be positive");
    }
    const fromExp = currencyExponent(this.currency);
    const toExp = currencyExponent(targetCurrency);
    // minor_to = minor_from * rate * 10^(toExp - fromExp)
    const numerator = this.amountMinor * rateScaled * pow10(toExp);
    const denominator = pow10(RATE_DECIMALS + fromExp);
    return new Money(divideRounded(numerator, denominator), targetCurrency);
  }

  equals(other: Money): boolean {
    return (
      this.currency === other.currency && this.amountMinor === other.amountMinor
    );
  }

  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other, "compare");
    if (this.amountMinor < other.amountMinor) return -1;
    if (this.amountMinor > other.amountMinor) return 1;
    return 0;
  }

  isZero(): boolean {
    return this.amountMinor === 0n;
  }

  isNegative(): boolean {
    return this.amountMinor < 0n;
  }

  /** Decimal string with the currency's full precision: 123456n KES → "1234.56". */
  toDecimalString(): string {
    const exp = currencyExponent(this.currency);
    if (exp === 0) return this.amountMinor.toString();
    const negative = this.amountMinor < 0n;
    const abs = negative ? -this.amountMinor : this.amountMinor;
    const whole = abs / pow10(exp);
    const frac = (abs % pow10(exp)).toString().padStart(exp, "0");
    return `${negative ? "-" : ""}${whole}.${frac}`;
  }

  toString(): string {
    return `${this.currency} ${this.toDecimalString()}`;
  }
}

/** Sum a list of Money values that must all share one currency. */
export function sumMoney(values: Money[], currency: string): Money {
  return values.reduce((acc, v) => acc.add(v), Money.zero(currency));
}
