import { index, pgTable, text } from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { timestamps } from "./helpers";

/**
 * Outbound email log (§3.7). Deliverability is business-critical; every send
 * (invoice, reminder, invitation, verification) leaves a row here.
 */
export const emailMessages = pgTable(
  "email_messages",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    type: text("type").notNull(), // invoice_send | reminder | invitation | ...
    recipient: text("recipient").notNull(),
    subject: text("subject"),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    providerMessageId: text("provider_message_id"),
    status: text("status").notNull().default("queued"),
    error: text("error"),
    ...timestamps,
  },
  (t) => [index("email_messages_org_idx").on(t.organizationId)],
);
