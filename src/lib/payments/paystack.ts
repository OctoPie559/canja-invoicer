import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  ChargeAuthorizationParams,
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
  authorization?: {
    authorization_code?: string;
    reusable?: boolean;
    channel?: string;
  };
  customer?: { customer_code?: string; email?: string };
}

/** The saved reusable card token, when the charge returned one (card only). */
function extractAuthorization(
  data: PaystackData,
): ProviderEvent["authorization"] {
  const a = data.authorization;
  if (!a?.authorization_code) return undefined;
  return {
    authorizationCode: a.authorization_code,
    reusable: Boolean(a.reusable),
    channel: a.channel,
  };
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
        authorization: extractAuthorization(data),
        customerCode: data.customer?.customer_code,
        raw: body,
      };
    },

    async fetchTransaction(reference): Promise<ProviderEvent | null> {
      const res = await fetch(
        `${API_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${secretKey}` } },
      );
      const json = (await res.json().catch(() => null)) as {
        status?: boolean;
        data?: PaystackData;
      } | null;
      if (!res.ok || !json?.status || !json.data) return null;
      const data = json.data;
      if (!data.reference || data.id == null || data.amount == null) return null;

      const status = normalizeStatus("", data);
      // label the event so its id matches the webhook's for a paid charge —
      // the two paths then dedup cleanly on (provider, provider_event_id)
      const eventType =
        status === "success"
          ? "charge.success"
          : status === "failed"
            ? "charge.failed"
            : "charge.pending";
      return {
        providerEventId: `${eventType}:${data.id}`,
        eventType,
        status,
        method: normalizeMethod(data.channel),
        reference: data.reference,
        providerTransactionId: String(data.id),
        amountMinor: BigInt(data.amount),
        currency: data.currency ?? "",
        authorization: extractAuthorization(data),
        customerCode: data.customer?.customer_code,
        raw: json,
      };
    },

    async chargeAuthorization(
      params: ChargeAuthorizationParams,
    ): Promise<ProviderEvent | null> {
      const res = await fetch(`${API_BASE}/transaction/charge_authorization`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          authorization_code: params.authorizationCode,
          email: params.email,
          amount: Number(params.amountMinor),
          currency: params.currency,
          reference: params.reference,
          metadata: params.metadata,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        status?: boolean;
        data?: PaystackData;
      } | null;
      // a transport/API failure (not a card decline) → null; the cron retries
      if (!res.ok || !json?.status || !json.data || json.data.id == null) {
        return null;
      }
      const data = json.data;
      // a card decline comes back status:true with data.status = "failed";
      // that IS a settled event we record (drives dunning), not a null
      const status = normalizeStatus("", data);
      const eventType =
        status === "success"
          ? "charge.success"
          : status === "failed"
            ? "charge.failed"
            : "charge.pending";
      return {
        providerEventId: `${eventType}:${data.id}`,
        eventType,
        status,
        method: normalizeMethod(data.channel),
        reference: data.reference ?? params.reference,
        providerTransactionId: String(data.id),
        amountMinor: BigInt(data.amount ?? Number(params.amountMinor)),
        currency: data.currency ?? params.currency,
        authorization: extractAuthorization(data),
        customerCode: data.customer?.customer_code,
        raw: json,
      };
    },
  };
}

/** The configured provider, or null when live payments are not set up. */
export function getPaystackProvider(): PaymentProvider | null {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  return secret ? createPaystackProvider(secret) : null;
}
