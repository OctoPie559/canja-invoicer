import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPaystackProvider } from "@/lib/payments/paystack";

/**
 * Paystack adapter unit tests: the webhook signature is an HMAC-SHA512 over the
 * RAW body with the secret key, and the payload maps to our provider-agnostic
 * event. Signature correctness is the security boundary — it gets its own test.
 */
describe("paystack provider (slice 8)", () => {
  const secret = "sk_test_example";
  const provider = createPaystackProvider(secret);

  const body = (over: Record<string, unknown> = {}, event = "charge.success") =>
    JSON.stringify({
      event,
      data: {
        id: 302961,
        reference: "cnj_abc123",
        amount: 150000,
        currency: "KES",
        status: "success",
        channel: "mobile_money",
        ...over,
      },
    });

  const sign = (raw: string) =>
    createHmac("sha512", secret).update(raw, "utf8").digest("hex");

  it("parses a valid, correctly-signed charge.success", () => {
    const raw = body();
    const ev = provider.verifyWebhook(raw, sign(raw));
    expect(ev).not.toBeNull();
    expect(ev!.eventType).toBe("charge.success");
    expect(ev!.status).toBe("success");
    expect(ev!.method).toBe("mpesa");
    expect(ev!.reference).toBe("cnj_abc123");
    expect(ev!.providerTransactionId).toBe("302961");
    expect(ev!.amountMinor).toBe(150000n);
    expect(ev!.currency).toBe("KES");
    // event id is unique per (event, transaction) — the callback dedup key
    expect(ev!.providerEventId).toBe("charge.success:302961");
  });

  it("maps provider channels to payment methods", () => {
    const card = body({ channel: "card" });
    expect(provider.verifyWebhook(card, sign(card))!.method).toBe("card");
    const bank = body({ channel: "bank" });
    expect(provider.verifyWebhook(bank, sign(bank))!.method).toBe("bank");
    const other = body({ channel: "qr" });
    expect(provider.verifyWebhook(other, sign(other))!.method).toBe("other");
  });

  it("marks a failed charge as failed", () => {
    const raw = body({ status: "failed" }, "charge.failed");
    expect(provider.verifyWebhook(raw, sign(raw))!.status).toBe("failed");
  });

  it("rejects a wrong signature", () => {
    const raw = body();
    expect(provider.verifyWebhook(raw, "deadbeef")).toBeNull();
  });

  it("rejects a missing signature", () => {
    const raw = body();
    expect(provider.verifyWebhook(raw, null)).toBeNull();
  });

  it("rejects a tampered body under a stale signature", () => {
    const raw = body();
    const sig = sign(raw);
    // a single trailing byte invalidates the HMAC
    expect(provider.verifyWebhook(`${raw} `, sig)).toBeNull();
  });

  it("rejects a payload missing required fields", () => {
    const raw = JSON.stringify({ event: "charge.success", data: { status: "success" } });
    expect(provider.verifyWebhook(raw, sign(raw))).toBeNull();
  });

  describe("fetchTransaction (checkout-return verify)", () => {
    afterEach(() => vi.restoreAllMocks());

    it("maps a verified transaction, event id matching the webhook's", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
          status: true,
          data: {
            id: 555,
            reference: "cnj_x",
            amount: 150000,
            currency: "KES",
            status: "success",
            channel: "card",
          },
        }),
      } as Response);

      const ev = await provider.fetchTransaction("cnj_x");
      expect(ev).not.toBeNull();
      expect(ev!.status).toBe("success");
      expect(ev!.method).toBe("card");
      expect(ev!.reference).toBe("cnj_x");
      expect(ev!.amountMinor).toBe(150000n);
      // same id a charge.success webhook would produce → the two dedup cleanly
      expect(ev!.providerEventId).toBe("charge.success:555");
    });

    it("returns null when the provider lookup is unsuccessful", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        json: async () => ({ status: false, message: "not found" }),
      } as Response);
      expect(await provider.fetchTransaction("cnj_missing")).toBeNull();
    });
  });
});
