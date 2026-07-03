import { pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { optimisticLock, softDelete, timestamps } from "./helpers";

/**
 * Self-monetization (§3.8). Plan entitlement definitions live in code
 * (lib/authz/entitlements.ts) and are checked server-side like permissions.
 * Never gated: audit trail, export, getting paid.
 */

export const plan = pgEnum("plan", ["free", "pro"]);

export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organization.id),
  plan: plan("plan").notNull().default("free"),
  status: text("status").notNull().default("active"),
  currentPeriodStart: timestamp("current_period_start", {
    withTimezone: true,
  }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  providerCustomerId: text("provider_customer_id"),
  providerSubscriptionId: text("provider_subscription_id"),
  ...timestamps,
  ...softDelete,
  ...optimisticLock,
});
