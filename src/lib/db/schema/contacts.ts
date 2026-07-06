import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { customers } from "./customers";
import { optimisticLock, softDelete, timestamps } from "./helpers";

/**
 * Contact persons (product decision, 2026-07-05): a customer is a company;
 * ALL person-level contact info lives here, not on the customer record.
 * Phone fields are MSISDNs — masked in logs, anonymized on data-subject
 * deletion, never dropped from financial history.
 */
export const customerContacts = pgTable(
  "customer_contacts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    salutation: text("salutation"), // Mr. / Mrs. / Ms. / Dr. / …
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    email: text("email"),
    workPhone: text("work_phone"),
    mobile: text("mobile"),
    designation: text("designation"),
    department: text("department"),
    isPrimary: boolean("is_primary").notNull().default(false),
    ...timestamps,
    ...softDelete,
    ...optimisticLock,
  },
  (t) => [
    index("customer_contacts_org_idx").on(t.organizationId),
    index("customer_contacts_customer_idx").on(t.customerId),
    // at most one live primary contact per customer, enforced by Postgres
    uniqueIndex("customer_contacts_primary_idx")
      .on(t.customerId)
      .where(sql`is_primary and deleted_at is null`),
  ],
);
