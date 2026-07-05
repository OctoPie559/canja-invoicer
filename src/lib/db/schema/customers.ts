import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { optimisticLock, softDelete, timestamps } from "./helpers";

/**
 * Customers (§3.4) are companies (or individuals) — person-level contact
 * info lives on customer_contacts, never here (decision, 2026-07-05).
 */
export const customers = pgTable(
  "customers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    name: text("name").notNull(),
    customerType: text("customer_type").notNull().default("business"), // business | individual
    // billing address
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    country: text("country"),
    // shipping address (goods invoicing)
    shippingAddressLine1: text("shipping_address_line1"),
    shippingAddressLine2: text("shipping_address_line2"),
    shippingCity: text("shipping_city"),
    shippingCountry: text("shipping_country"),
    notes: text("notes"),
    preferredCurrency: text("preferred_currency"),
    ...timestamps,
    ...softDelete,
    ...optimisticLock,
  },
  (t) => [index("customers_org_idx").on(t.organizationId)],
);

/** Layer-3 version history: full row image per change. */
export const customerVersions = pgTable(
  "customer_versions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    version: integer("version").notNull(),
    data: jsonb("data").notNull(),
    changedBy: text("changed_by"),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("customer_versions_customer_idx").on(t.customerId)],
);
