import { describe, expect, it } from "vitest";
import { scrubStrings } from "@/lib/observability/scrub";

describe("Sentry payload scrubbing", () => {
  it("masks MSISDNs in nested strings while leaving structure intact", () => {
    const event = {
      message: "STK push failed for +254712345678",
      extra: {
        attempts: [{ note: "retried 0712 345 678 twice" }],
        count: 2,
      },
      timestamp: 1751527000000,
    };
    const scrubbed = scrubStrings(event);
    expect(scrubbed.message).not.toContain("712345678");
    expect(scrubbed.extra.attempts[0].note).not.toContain("345 678");
    expect(scrubbed.extra.count).toBe(2);
    expect(scrubbed.timestamp).toBe(1751527000000);
  });

  it("handles arrays, nulls, and non-object values", () => {
    expect(scrubStrings(null)).toBeNull();
    expect(scrubStrings(["+254712345678"])[0]).not.toContain("712345678");
    expect(scrubStrings(42)).toBe(42);
  });

  it("masks email local parts, keeping the domain for debuggability", () => {
    const scrubbed = scrubStrings({
      message: "delivery failed for wanjiku.kamau@gmail.com",
    });
    expect(scrubbed.message).not.toContain("wanjiku.kamau");
    expect(scrubbed.message).toContain("w***@gmail.com");
  });
});
