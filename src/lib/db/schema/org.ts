import {
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { optimisticLock, softDelete, timestamps } from "./helpers";

/** One row per org: base currency, numbering counters, defaults (§3.3). */
export const organizationSettings = pgTable("organization_settings", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organization.id),
  baseCurrency: text("base_currency").notNull().default("KES"),
  // Display numbers: per-org sequential counters incremented under
  // SELECT ... FOR UPDATE at issue time. Separate from PKs by design.
  invoicePrefix: text("invoice_prefix").notNull().default("INV"),
  invoiceNextNumber: integer("invoice_next_number").notNull().default(1),
  estimatePrefix: text("estimate_prefix").notNull().default("EST"),
  estimateNextNumber: integer("estimate_next_number").notNull().default(1),
  creditNotePrefix: text("credit_note_prefix").notNull().default("CN"),
  creditNoteNextNumber: integer("credit_note_next_number").notNull().default(1),
  defaultPaymentTermsDays: integer("default_payment_terms_days")
    .notNull()
    .default(30),
  defaultTaxRateId: text("default_tax_rate_id"),
  // prefilled into the builder for new invoices; editable per document
  defaultInvoiceNotes: text("default_invoice_notes"),
  defaultInvoiceTerms: text("default_invoice_terms"),
  // onboarding data collection (issue 1): where the org's creator found us
  referralSource: text("referral_source"),
  ...timestamps,
  ...softDelete,
  ...optimisticLock,
});

/** Branding applied to invoices and the public view; snapshotted at issue. */
export const organizationBranding = pgTable("organization_branding", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organization.id),
  logoKey: text("logo_key"), // R2 object key
  accentColor: text("accent_color"),
  legalName: text("legal_name"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  country: text("country"),
  kraPin: text("kra_pin"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"), // MSISDN — mask in logs, always
  // built-in PDF layout; non-default choices are Pro (customTemplates).
  // Frozen into the issue snapshot — switching never re-skins history.
  pdfTemplate: text("pdf_template").notNull().default("classic"),
  ...timestamps,
  ...softDelete,
  ...optimisticLock,
});

/** Named tax rates; rate stored as integer basis points (1600 = 16.00%). */
export const taxRates = pgTable("tax_rates", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id),
  name: text("name").notNull(),
  rateBps: integer("rate_bps").notNull(),
  ...timestamps,
  ...softDelete,
  ...optimisticLock,
});

/** Layer-3 version history: full row image per change. */
export const taxRateVersions = pgTable("tax_rate_versions", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id),
  taxRateId: text("tax_rate_id")
    .notNull()
    .references(() => taxRates.id),
  version: integer("version").notNull(),
  data: jsonb("data").notNull(),
  changedBy: text("changed_by"),
  changedAt: timestamp("changed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * FX rates (§5.6): a rate is a ratio, not money — numeric(18,8). Manual
 * entry first; a scheduled fetch can add rows later with source='api'.
 */
export const fxRates = pgTable(
  "fx_rates",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    fromCurrency: text("from_currency").notNull(),
    toCurrency: text("to_currency").notNull(),
    rate: numeric("rate", { precision: 18, scale: 8 }).notNull(),
    source: text("source").notNull().default("manual"),
    effectiveDate: date("effective_date").notNull(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("fx_rates_org_pair_date_idx").on(
      t.organizationId,
      t.fromCurrency,
      t.toCurrency,
      t.effectiveDate,
    ),
  ],
);
