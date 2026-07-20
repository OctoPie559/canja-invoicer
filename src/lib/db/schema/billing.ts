import {
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
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
  // Wave 6 (recurring billing). Card subscriptions auto-renew via the
  // provider; M-Pesa can't (one-time authorizations) so it stays "manual".
  renewalMode: text("renewal_mode").notNull().default("manual"), // auto | manual
  // saved card token for auto-renew (card only; never an M-Pesa authorization)
  authorizationCode: text("authorization_code"),
  // provider token required to disable/cancel the subscription
  subscriptionEmailToken: text("subscription_email_token"),
  // the user asked to stop; still Pro until currentPeriodEnd
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  // dunning window after a failed renewal — Pro is retained until this passes
  graceUntil: timestamp("grace_until", { withTimezone: true }),
  ...timestamps,
  ...softDelete,
  ...optimisticLock,
});
