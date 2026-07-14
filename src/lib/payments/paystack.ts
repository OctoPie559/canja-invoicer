import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  ChargeSession,
  InitiateChargeParams,
  PaymentProvider,
  ProviderEvent,
  ProviderEventStatus,
  ProviderMethod,
} from "./provider";

/**
 * Paystack implementation of the PaymentProvider port (M-Pesa + cards for
 * Kenya). Provider-specific quirks — the HMAC-SHA512 webhook signature, the
 * initialize endpoint, amounts in minor units — are contained entirely here;
 * nothing above this file knows the word "Paystack" beyond a config string.
 */

const API_BASE = "https://api.paystack.co";

interface PaystackData {
  id?: number | string;
  reference?: string;
  amount?: number;
  currency?: string;
  status?: string;
  channel?: string;
}

function normalizeStatus(event: string, data: PaystackData): ProviderEventStatus {
  if (event === "charge.success" || data.status === "success") return "success";
  if (event === "charge.failed" || data.status === "failed") return "failed";
  if (data.status === "pending" || data.status === "ongoing") return "pending";
  return "other";
}

function normalizeMethod(channel: string | undefined): ProviderMethod {
  switch (channel) {
    case "mobile_money":
      return "mpesa";
    case "card":
      return "card";
    case "bank":
    case "bank_transfer":
      return "bank";
    default:
      return "other";
  }
}

/** Constant-time compare of two hex digests without throwing on length. */
function safeHexEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function createPaystackProvider(secretKey: string): PaymentProvider {
  return {
    name: "paystack",

    async initiateCharge(params: InitiateChargeParams): Promise<ChargeSession> {
      const res = await fetch(`${API_BASE}/transaction/initialize`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reference: params.reference,
          // Paystack amounts are integers in the currency's minor unit —
          // the same unit our Money value object stores.
          amount: Number(params.amountMinor),
          currency: params.currency,
          email: params.email,
          callback_url: params.callbackUrl,
          metadata: params.metadata,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        status?: boolean;
        message?: string;
        data?: { authorization_url?: string; access_code?: string; reference?: string };
      } | null;
      if (!res.ok || !json?.status || !json.data?.authorization_url) {
        throw new Error(
          `Paystack initialize failed: ${json?.message ?? res.statusText}`,
        );
      }
      return {
        reference: json.data.reference ?? params.reference,
        authorizationUrl: json.data.authorization_url,
        providerReference: json.data.access_code ?? "",
      };
    },

    verifyWebhook(rawBody, signature): ProviderEvent | null {
      if (!signature) return null;
      const expected = createHmac("sha512", secretKey)
        .update(rawBody, "utf8")
        .digest("hex");
      if (!safeHexEqual(signature, expected)) return null;

      let body: { event?: string; data?: PaystackData };
      try {
        body = JSON.parse(rawBody);
      } catch {
        return null;
      }
      const event = body.event ?? "";
      const data = body.data ?? {};
      if (!data.reference || data.id == null || data.amount == null) return null;

      return {
        providerEventId: `${event}:${data.id}`,
        eventType: event,
        status: normalizeStatus(event, data),
        method: normalizeMethod(data.channel),
        reference: data.reference,
        providerTransactionId: String(data.id),
        amountMinor: BigInt(data.amount),
        currency: data.currency ?? "",
        raw: body,
      };
    },
  };
}

/** The configured provider, or null when live payments are not set up. */
export function getPaystackProvider(): PaymentProvider | null {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  return secret ? createPaystackProvider(secret) : null;
}
