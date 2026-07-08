import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { taxRates } from "./org";
import { moneyMinor, optimisticLock, softDelete, timestamps } from "./helpers";

/** Reusable catalog items (§3.4). Price is bigint minor units + currency. */
export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    name: text("name").notNull(),
    // a catalog item is a good or a service (brief §8 glossary); services
    // are the default for our freelancer-first market
    productType: text("product_type").notNull().default("service"),
    description: text("description"),
    unitLabel: text("unit_label"),
    unitPriceMinor: moneyMinor("unit_price_minor"),
    currency: text("currency").notNull(),
    defaultTaxRateId: text("default_tax_rate_id").references(() => taxRates.id),
    // R2 object key for the catalog image; public URL resolved at read time
    imageKey: text("image_key"),
    ...timestamps,
    ...softDelete,
    ...optimisticLock,
  },
  (t) => [index("products_org_idx").on(t.organizationId)],
);

/** Layer-3 version history — price changes are the headline use case. */
export const productVersions = pgTable(
  "product_versions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    version: integer("version").notNull(),
    data: jsonb("data").notNull(),
    changedBy: text("changed_by"),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("product_versions_product_idx").on(t.productId)],
);
