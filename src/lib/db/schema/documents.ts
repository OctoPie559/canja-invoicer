import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { customers } from "./customers";
import { products } from "./products";
import { moneyMinor, optimisticLock, softDelete, timestamps } from "./helpers";

/**
 * Billing documents (§3.5). Invoices, estimates, and credit notes share the
 * same shape rules: draft-editable, immutable after issue, snapshot JSONB
 * frozen at issue, display number assigned at issue from the per-org counter.
 * Immutability is enforced in the service layer; corrections go through
 * credit notes or new documents, never edits.
 */

export const invoiceStatus = pgEnum("invoice_status", [
  "draft",
  "sent",
  "partial",
  "paid",
  "overdue",
  "void",
]);

export const estimateStatus = pgEnum("estimate_status", [
  "draft",
  "sent",
  "accepted",
  "declined",
  "expired",
  "converted",
]);

export const creditNoteStatus = pgEnum("credit_note_status", [
  "draft",
  "issued",
  "void",
]);

export const recurringStatus = pgEnum("recurring_status", [
  "active",
  "paused",
  "ended",
]);

export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    status: invoiceStatus("status").notNull().default("draft"),
    displayNumber: text("display_number"), // null until issue
    currency: text("currency").notNull(), // transaction currency
    // FX rate to org base currency, frozen at issue; null when currency = base
    fxRateToBase: numeric("fx_rate_to_base", { precision: 18, scale: 8 }),
    issueDate: date("issue_date"),
    dueDate: date("due_date"),
    // payment terms behind the due date, in days ("Net 30"); null = a
    // custom due date was set directly. Recorded so documents/PDFs can
    // print the terms, not just the date they produced.
    paymentTermsDays: integer("payment_terms_days"),
    subtotalMinor: moneyMinor("subtotal_minor"),
    discountTotalMinor: moneyMinor("discount_total_minor"),
    taxTotalMinor: moneyMinor("tax_total_minor"),
    totalMinor: moneyMinor("total_minor"),
    amountPaidMinor: moneyMinor("amount_paid_minor"),
    notes: text("notes"),
    terms: text("terms"),
    // unguessable token for the hosted public view; renders from snapshot only
    publicToken: text("public_token").unique(),
    // customer, branding, line details, FX — copied at issue (Layer 2)
    snapshot: jsonb("snapshot"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    ...timestamps,
    ...softDelete,
    ...optimisticLock, // applies to drafts only
  },
  (t) => [
    index("invoices_org_idx").on(t.organizationId),
    index("invoices_org_status_idx").on(t.organizationId, t.status),
    index("invoices_customer_idx").on(t.customerId),
    uniqueIndex("invoices_org_display_number_idx")
      .on(t.organizationId, t.displayNumber)
      .where(sql`display_number is not null`),
  ],
);

export const invoiceLineItems = pgTable(
  "invoice_line_items",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id),
    productId: text("product_id").references(() => products.id),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    unitPriceMinor: moneyMinor("unit_price_minor"),
    discountBps: integer("discount_bps").notNull().default(0),
    // copied from tax_rates at edit time, not referenced — later tax edits
    // must not reach into history
    taxRateBps: integer("tax_rate_bps").notNull().default(0),
    lineTotalMinor: moneyMinor("line_total_minor"),
    position: integer("position").notNull(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("invoice_line_items_invoice_idx").on(t.invoiceId)],
);

export const estimates = pgTable(
  "estimates",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    status: estimateStatus("status").notNull().default("draft"),
    displayNumber: text("display_number"),
    currency: text("currency").notNull(),
    fxRateToBase: numeric("fx_rate_to_base", { precision: 18, scale: 8 }),
    issueDate: date("issue_date"),
    expiryDate: date("expiry_date"),
    subtotalMinor: moneyMinor("subtotal_minor"),
    discountTotalMinor: moneyMinor("discount_total_minor"),
    taxTotalMinor: moneyMinor("tax_total_minor"),
    totalMinor: moneyMinor("total_minor"),
    notes: text("notes"),
    terms: text("terms"),
    publicToken: text("public_token").unique(),
    snapshot: jsonb("snapshot"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    convertedInvoiceId: text("converted_invoice_id").references(
      () => invoices.id,
    ),
    ...timestamps,
    ...softDelete,
    ...optimisticLock,
  },
  (t) => [
    index("estimates_org_idx").on(t.organizationId),
    uniqueIndex("estimates_org_display_number_idx")
      .on(t.organizationId, t.displayNumber)
      .where(sql`display_number is not null`),
  ],
);

export const estimateLineItems = pgTable(
  "estimate_line_items",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    estimateId: text("estimate_id")
      .notNull()
      .references(() => estimates.id),
    productId: text("product_id").references(() => products.id),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    unitPriceMinor: moneyMinor("unit_price_minor"),
    discountBps: integer("discount_bps").notNull().default(0),
    taxRateBps: integer("tax_rate_bps").notNull().default(0),
    lineTotalMinor: moneyMinor("line_total_minor"),
    position: integer("position").notNull(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("estimate_line_items_estimate_idx").on(t.estimateId)],
);

/** Issued against an invoice for corrections/refunds — never by editing it. */
export const creditNotes = pgTable(
  "credit_notes",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id),
    status: creditNoteStatus("status").notNull().default("draft"),
    displayNumber: text("display_number"),
    currency: text("currency").notNull(),
    fxRateToBase: numeric("fx_rate_to_base", { precision: 18, scale: 8 }),
    issueDate: date("issue_date"),
    subtotalMinor: moneyMinor("subtotal_minor"),
    taxTotalMinor: moneyMinor("tax_total_minor"),
    totalMinor: moneyMinor("total_minor"),
    reason: text("reason"),
    snapshot: jsonb("snapshot"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    ...timestamps,
    ...softDelete,
    ...optimisticLock,
  },
  (t) => [
    index("credit_notes_org_idx").on(t.organizationId),
    index("credit_notes_invoice_idx").on(t.invoiceId),
    uniqueIndex("credit_notes_org_display_number_idx")
      .on(t.organizationId, t.displayNumber)
      .where(sql`display_number is not null`),
  ],
);

export const creditNoteLineItems = pgTable(
  "credit_note_line_items",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    creditNoteId: text("credit_note_id")
      .notNull()
      .references(() => creditNotes.id),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    unitPriceMinor: moneyMinor("unit_price_minor"),
    taxRateBps: integer("tax_rate_bps").notNull().default(0),
    lineTotalMinor: moneyMinor("line_total_minor"),
    position: integer("position").notNull(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("credit_note_line_items_cn_idx").on(t.creditNoteId)],
);

/** Schedule template; cron generates invoices per run, audited as system. */
export const recurringInvoices = pgTable(
  "recurring_invoices",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    status: recurringStatus("status").notNull().default("active"),
    currency: text("currency").notNull(),
    frequency: text("frequency").notNull(), // weekly | monthly | quarterly | yearly
    intervalCount: integer("interval_count").notNull().default(1),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    endDate: date("end_date"),
    // org choice (slice 7 decision): generate a draft or auto-issue
    autoIssue: text("auto_issue").notNull().default("draft"),
    notes: text("notes"),
    terms: text("terms"),
    ...timestamps,
    ...softDelete,
    ...optimisticLock,
  },
  (t) => [index("recurring_invoices_org_idx").on(t.organizationId)],
);

export const recurringInvoiceItems = pgTable(
  "recurring_invoice_items",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    recurringInvoiceId: text("recurring_invoice_id")
      .notNull()
      .references(() => recurringInvoices.id),
    productId: text("product_id").references(() => products.id),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    unitPriceMinor: moneyMinor("unit_price_minor"),
    discountBps: integer("discount_bps").notNull().default(0),
    taxRateBps: integer("tax_rate_bps").notNull().default(0),
    position: integer("position").notNull(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("recurring_invoice_items_recurring_idx").on(t.recurringInvoiceId),
  ],
);
