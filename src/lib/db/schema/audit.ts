import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";

/**
 * Layer-1 audit trail (§3.7): append-only at the database level. A migration
 * REVOKEs UPDATE and DELETE from the application role — the trail cannot be
 * rewritten by the app, by design. Rows are written inside every mutation's
 * transaction via writeAudit; there is no UPDATE path in code either.
 * Activity timelines read straight from this table.
 */

export const actorType = pgEnum("actor_type", ["user", "system", "api_key", "customer"]);

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    actorId: text("actor_id"), // null for system actors
    actorType: actorType("actor_type").notNull(),
    // business event, not a column diff: invoice.issued, payment.recorded, ...
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    changes: jsonb("changes"), // before/after diff
    metadata: jsonb("metadata"), // ip, user agent, request id — PII-masked
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_log_org_created_idx").on(t.organizationId, t.createdAt),
    index("audit_log_org_entity_idx").on(
      t.organizationId,
      t.entityType,
      t.entityId,
    ),
  ],
);
