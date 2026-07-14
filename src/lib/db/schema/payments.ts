import {
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { invoices } from "./documents";
import { moneyMinor, softDelete, timestamps } from "./helpers";

/**
 * Live payments (§3.6, slice 8). Collection runs behind the `PaymentProvider`
 * port (Paystack first): the app initiates a charge, the payer completes it on
 * the provider, and an idempotent webhook records the money. Subscriptions are
 * self-billed through the same rail.
 */

/**
 * Payments (§3.6). A payment records the money as received — its own
 * currency and amount — plus the conversion into the invoice currency when
 * they differ (a USD invoice paid in KES stores both sides explicitly).
 */

export const paymentMethod = pgEnum("payment_method", [
  "mpesa",
  "bank",
  "cash",
  "card",
  "other",
]);

export const paymentSource = pgEnum("payment_source", ["manual", "gateway"]);

export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id),
    amountMinor: moneyMinor("amount_minor"), // as received
    currency: text("currency").notNull(), // as received
    // conversion when payment currency differs from invoice currency
    fxRateUsed: numeric("fx_rate_used", { precision: 18, scale: 8 }),
    amountInInvoiceCurrencyMinor: moneyMinor(
      "amount_in_invoice_currency_minor",
    ),
    // over/under-payment from rate movement, stored explicitly, never fudged
    settlementDeltaMinor: moneyMinor("settlement_delta_minor"),
    method: paymentMethod("method").notNull(),
    source: paymentSource("source").notNull().default("manual"),
    provider: text("provider"),
    // idempotency key for gateway callbacks (M-Pesa retries/duplicates);
    // GLOBALLY unique — never fed from manual entry
    providerTransactionId: text("provider_transaction_id"),
    // free-text manual reference (bank slip, M-Pesa code) — deliberately
    // non-unique: one transfer may legitimately settle several invoices
    reference: text("reference"),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    recordedBy: text("recorded_by"),
    notes: text("notes"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("payments_org_idx").on(t.organizationId),
    index("payments_invoice_idx").on(t.invoiceId),
    uniqueIndex("payments_provider_txn_idx").on(t.providerTransactionId),
  ],
);

/** Raw provider payloads — reconciliation + audit. Empty until slice 8. */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    provider: text("provider").notNull(),
    eventType: text("event_type").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    payload: jsonb("payload").notNull(),
    processingStatus: text("processing_status").notNull().default("received"),
    paymentId: text("payment_id").references(() => payments.id),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("payment_events_provider_event_idx").on(
      t.provider,
      t.providerEventId,
    ),
    index("payment_events_org_idx").on(t.organizationId),
  ],
);

export const paymentIntentPurpose = pgEnum("payment_intent_purpose", [
  "invoice",
  "subscription",
]);

export const paymentIntentStatus = pgEnum("payment_intent_status", [
  "pending",
  "succeeded",
  "failed",
  "abandoned",
]);

/**
 * A charge we initiated with the provider, holding the intent so the webhook
 * can correlate the callback back to what it pays for (§6 reconciliation).
 * `reference` is the unguessable key we send to the provider and it echoes
 * back — globally unique, it is the join between our world and theirs. Pending
 * intents past `expires_at` are swept to `abandoned` by the reconcile cron.
 */
export const paymentIntents = pgTable(
  "payment_intents",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    purpose: paymentIntentPurpose("purpose").notNull(),
    // set for purpose = invoice
    invoiceId: text("invoice_id").references(() => invoices.id),
    // set for purpose = subscription: which Pro billing interval was chosen
    billingInterval: text("billing_interval"),
    reference: text("reference").notNull(),
    provider: text("provider").notNull(),
    // the provider's own handle for the initiated charge (access code / ref)
    providerReference: text("provider_reference"),
    amountMinor: moneyMinor("amount_minor"),
    currency: text("currency").notNull(),
    status: paymentIntentStatus("status").notNull().default("pending"),
    // the payment row created when the charge succeeds (invoice purpose)
    paymentId: text("payment_id").references(() => payments.id),
    // user who started it; null when a customer pays via the public link
    initiatedBy: text("initiated_by"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("payment_intents_reference_idx").on(t.reference),
    index("payment_intents_org_idx").on(t.organizationId),
    index("payment_intents_invoice_idx").on(t.invoiceId),
    index("payment_intents_status_idx").on(t.status),
  ],
);
