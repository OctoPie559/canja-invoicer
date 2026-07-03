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
    // idempotency key for gateway callbacks (M-Pesa retries/duplicates)
    providerTransactionId: text("provider_transaction_id"),
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
