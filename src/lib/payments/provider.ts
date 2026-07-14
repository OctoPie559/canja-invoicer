import { randomBytes } from "node:crypto";

/**
 * Payment provider port (ARCHITECTURE.md §6). The only payments surface the
 * domain and UI ever see — Paystack is the first implementation, Daraja and
 * Flutterwave later implement the SAME interface, so no provider-specific code
 * ever leaks past this boundary.
 */

export interface InitiateChargeParams {
  /** Our unguessable correlation key; the provider echoes it in the webhook. */
  reference: string;
  /** Amount in minor units, in the provider's charge currency. */
  amountMinor: bigint;
  currency: string;
  /** The payer's email — Paystack (and most gateways) require it. */
  email: string;
  /** Where the provider returns the payer after checkout. */
  callbackUrl?: string;
  /** Opaque context echoed back on the event (never trusted for auth). */
  metadata?: Record<string, unknown>;
}

export interface ChargeSession {
  reference: string;
  /** Where to send the payer to complete the charge (STK push / checkout). */
  authorizationUrl: string;
  /** The provider's own handle for the initiated charge. */
  providerReference: string;
}

export type ProviderEventStatus = "success" | "failed" | "pending" | "other";

/** Normalized payment method, mapped from the provider's channel. */
export type ProviderMethod = "mpesa" | "card" | "bank" | "other";

export interface ProviderEvent {
  /** Unique per provider event — the idempotency key for the callback. */
  providerEventId: string;
  /** Raw provider event name, e.g. "charge.success". */
  eventType: string;
  status: ProviderEventStatus;
  /** How the payer paid, mapped from the provider channel by the adapter. */
  method: ProviderMethod;
  /** Our reference, echoed back — the join to the payment_intent. */
  reference: string;
  /** The provider's transaction id — unique per settled charge. */
  providerTransactionId: string;
  amountMinor: bigint;
  currency: string;
  /** The full, verified payload for the payment_events audit row. */
  raw: unknown;
}

export interface PaymentProvider {
  readonly name: string;
  /** Initiate a charge; returns the URL to send the payer to. */
  initiateCharge(params: InitiateChargeParams): Promise<ChargeSession>;
  /**
   * Verify a webhook's signature against the raw body and parse it. Returns
   * null when the signature is invalid or the payload is not a charge event we
   * act on — the caller treats null as "reject, write nothing".
   */
  verifyWebhook(rawBody: string, signature: string | null): ProviderEvent | null;
}

/**
 * An unguessable reference sent to the provider and stored on the intent. Not
 * a UUID: kept URL-safe and prefixed so it is recognisable in provider
 * dashboards and logs.
 */
export function newChargeReference(): string {
  return `cnj_${randomBytes(18).toString("base64url")}`;
}
