import { describe, expect, it } from "vitest";
import { priceChangeVersions } from "@/lib/services/products";

const v = (version: number, minor: number, currency = "KES") => ({
  version,
  data: { unitPriceMinor: String(minor), currency },
});

/** Issue 15: the price history must list only actual price changes, not every
 *  edit — a non-price edit still writes a version row, which used to appear as
 *  a redundant same-price line. */
describe("priceChangeVersions (issue 15)", () => {
  it("drops versions whose price is unchanged from the one before", () => {
    // v1 600, v2 600 (name edit), v3 750 (price change), v4 750 (desc edit)
    const versions = [
      v(4, 7500000),
      v(3, 7500000),
      v(2, 6000000),
      v(1, 6000000),
    ]; // newest-first, as the page receives them
    expect(priceChangeVersions(versions).map((x) => x.version)).toEqual([3, 1]);
  });

  it("always keeps the initial version (no predecessor)", () => {
    expect(priceChangeVersions([v(1, 6000000)]).map((x) => x.version)).toEqual([
      1,
    ]);
  });

  it("keeps a real price change", () => {
    expect(
      priceChangeVersions([v(2, 7000000), v(1, 6000000)]).map((x) => x.version),
    ).toEqual([2, 1]);
  });

  it("treats a currency change as a price change", () => {
    const versions = [
      { version: 2, data: { unitPriceMinor: "6000000", currency: "USD" } },
      { version: 1, data: { unitPriceMinor: "6000000", currency: "KES" } },
    ];
    expect(priceChangeVersions(versions).map((x) => x.version)).toEqual([2, 1]);
  });
});
