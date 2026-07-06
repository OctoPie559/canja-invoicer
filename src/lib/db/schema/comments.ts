import { index, pgTable, text } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { softDelete, timestamps } from "./helpers";

/**
 * Internal notes pinned to an entity (customers now; invoices/estimates can
 * reuse the same table later). Visible to org members only — never to the
 * customer. Mutations run through the audited service pipeline.
 */
export const comments = pgTable(
  "comments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    entityType: text("entity_type").notNull(), // customer | invoice | ...
    entityId: text("entity_id").notNull(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id),
    body: text("body").notNull(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("comments_org_entity_idx").on(
      t.organizationId,
      t.entityType,
      t.entityId,
    ),
  ],
);
