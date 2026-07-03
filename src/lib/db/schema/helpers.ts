import { sql } from "drizzle-orm";
import { bigint, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Column conventions (ARCHITECTURE.md §3.1): every table gets timestamps and
 * a soft-delete tombstone (offline-sync + DPA anonymize-not-drop); editable
 * entities get an optimistic-lock version column; money is always bigint
 * minor units next to a currency code.
 */

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const softDelete = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

export const optimisticLock = {
  version: integer("version").notNull().default(1),
};

/** bigint minor-units money column (read back as JS bigint, never number). */
export const moneyMinor = (name: string) =>
  bigint(name, { mode: "bigint" }).notNull().default(sql`0`);
