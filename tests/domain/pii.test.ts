import { describe, expect, it } from "vitest";
import { maskMsisdn, maskPiiInText } from "@/lib/domain/pii";

describe("MSISDN masking (Kenya DPA 2019)", () => {
  it("masks phone values keeping only a prefix hint and last two digits", () => {
    expect(maskMsisdn("+254712345678")).toBe("+254****78");
    expect(maskMsisdn("0712345678")).toBe("071****78");
    expect(maskMsisdn("254712345678")).toBe("254****78");
  });

  it("never returns enough digits to reconstruct the number", () => {
    const masked = maskMsisdn("+254712345678");
    expect(masked.replace(/\D/g, "").length).toBeLessThanOrEqual(5);
  });

  it("scrubs phone-shaped substrings from free text", () => {
    const line = "STK push failed for +254712345678 (invoice INV-042)";
    const scrubbed = maskPiiInText(line);
    expect(scrubbed).not.toContain("712345678");
    expect(scrubbed).toContain("INV-042");
  });

  it("scrubs local-format numbers in text", () => {
    expect(maskPiiInText("customer 0712 345 678 unreachable")).not.toContain("345");
  });

  it("leaves non-phone numerics alone", () => {
    expect(maskPiiInText("total 1500.00 KES on 42 invoices")).toBe(
      "total 1500.00 KES on 42 invoices",
    );
  });
});
