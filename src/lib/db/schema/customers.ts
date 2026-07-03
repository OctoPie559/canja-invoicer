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
 * Customers (§3.4). phone is an MSISDN — personal data under the Kenya DPA:
 * masked in logs, anonymized (not dropped) on data-subject deletion.
 */
export const customers = pgTable(
  "customers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    country: text("country"),
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
