import { and, desc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { withOrgTransaction } from "@/lib/db/tx";
import {
  auditLog,
  customerContacts,
  customers,
  customerVersions,
  emailMessages,
  invoices,
  payments,
  user,
} from "@/lib/db/schema";
import { Money } from "@/lib/domain/money";
import { insertContact } from "./contacts";
import { newId } from "@/lib/domain/ids";
import {
  ConflictError,
  NotFoundError,
  PermissionError,
} from "@/lib/domain/errors";
import { writeAudit } from "@/lib/audit/write";
import { changedFields, jsonSafe } from "@/lib/audit/diff";
import type { ActorContext } from "@/lib/audit/context";
import { authorize } from "@/lib/authz/permissions";
import { getMembership } from "./organizations";
import {
  createCustomerSchema,
  deleteCustomerSchema,
  updateCustomerSchema,
  type CreateCustomerInput,
  type DeleteCustomerInput,
  type UpdateCustomerInput,
} from "@/lib/validation/customers";

/**
 * Customers (brief §4.1) through the mutation pipeline: validate → authorize
 * → RLS-armed transaction → mutate + version-history row + audit, all in one
 * transaction. Soft delete only — customer rows may be referenced by
 * financial documents forever.
 */

const EDITABLE_FIELDS = [
  "name",
  "customerType",
  "addressLine1",
  "addressLine2",
  "city",
  "country",
  "shippingAddressLine1",
  "shippingAddressLine2",
  "shippingCity",
  "shippingCountry",
  "notes",
  "preferredCurrency",
] as const;

export async function createCustomer(
  db: Database,
  ctx: ActorContext,
  input: CreateCustomerInput,
): Promise<{ customerId: string }> {
  const data = createCustomerSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("customer.create");
  const customerId = newId();

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "customer.create");

    const { primaryContact, ...fields } = data;
    await tx.insert(customers).values({
      id: customerId,
      organizationId: ctx.organizationId,
      ...fields,
    });
    const [row] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, customerId));
    await tx.insert(customerVersions).values({
      id: newId(),
      organizationId: ctx.organizationId,
      customerId,
      version: row.version,
      data: jsonSafe(row),
      changedBy: ctx.actorId,
    });
    await writeAudit(tx, ctx, {
      action: "customer.created",
      entityType: "customer",
      entityId: customerId,
      changes: { after: jsonSafe({ ...fields }) },
    });
    // optional inline primary contact — same transaction, own audit row
    if (primaryContact) {
      await insertContact(tx, ctx, customerId, primaryContact, true);
    }
  });

  return { customerId };
}

export async function updateCustomer(
  db: Database,
  ctx: ActorContext,
  input: UpdateCustomerInput,
): Promise<void> {
  const data = updateCustomerSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("customer.update");

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "customer.update");

    const [current] = await tx
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, data.id),
          eq(customers.organizationId, ctx.organizationId),
          isNull(customers.deletedAt),
        ),
      )
      .for("update");
    if (!current) throw new NotFoundError("customer");
    if (current.version !== data.version) throw new ConflictError("customer");

    const fields = {
      name: data.name,
      customerType: data.customerType,
      addressLine1: data.addressLine1 ?? null,
      addressLine2: data.addressLine2 ?? null,
      city: data.city ?? null,
      country: data.country ?? null,
      shippingAddressLine1: data.shippingAddressLine1 ?? null,
      shippingAddressLine2: data.shippingAddressLine2 ?? null,
      shippingCity: data.shippingCity ?? null,
      shippingCountry: data.shippingCountry ?? null,
      notes: data.notes ?? null,
      preferredCurrency: data.preferredCurrency ?? null,
    };
    const diff = changedFields(current, fields, EDITABLE_FIELDS);
    if (diff.changed.length === 0) return; // nothing to write, nothing to audit

    const nextVersion = current.version + 1;
    await tx
      .update(customers)
      .set({ ...fields, version: nextVersion, updatedAt: new Date() })
      .where(eq(customers.id, data.id));
    const [row] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, data.id));
    await tx.insert(customerVersions).values({
      id: newId(),
      organizationId: ctx.organizationId,
      customerId: data.id,
      version: nextVersion,
      data: jsonSafe(row),
      changedBy: ctx.actorId,
    });
    await writeAudit(tx, ctx, {
      action: "customer.updated",
      entityType: "customer",
      entityId: data.id,
      changes: { before: diff.before, after: diff.after },
    });
  });
}

export async function deleteCustomer(
  db: Database,
  ctx: ActorContext,
  input: DeleteCustomerInput,
): Promise<void> {
  const data = deleteCustomerSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("customer.delete");

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "customer.delete");

    const [current] = await tx
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, data.id),
          eq(customers.organizationId, ctx.organizationId),
          isNull(customers.deletedAt),
        ),
      )
      .for("update");
    if (!current) throw new NotFoundError("customer");
    if (current.version !== data.version) throw new ConflictError("customer");

    const nextVersion = current.version + 1;
    await tx
      .update(customers)
      .set({ deletedAt: new Date(), version: nextVersion, updatedAt: new Date() })
      .where(eq(customers.id, data.id));
    const [row] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, data.id));
    await tx.insert(customerVersions).values({
      id: newId(),
      organizationId: ctx.organizationId,
      customerId: data.id,
      version: nextVersion,
      data: jsonSafe(row),
      changedBy: ctx.actorId,
    });
    await writeAudit(tx, ctx, {
      action: "customer.deleted",
      entityType: "customer",
      entityId: data.id,
      changes: { before: { deletedAt: null }, after: { deletedAt: row.deletedAt } },
    });
  });
}

/** Org-scoped reads (transport may call these directly). */

export async function listCustomers(db: Database, organizationId: string) {
  return db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.organizationId, organizationId),
        isNull(customers.deletedAt),
      ),
    )
    .orderBy(customers.name);
}

export async function getCustomer(
  db: Database,
  organizationId: string,
  customerId: string,
) {
  const [row] = await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.id, customerId),
        eq(customers.organizationId, organizationId),
        isNull(customers.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Full version history, newest first — "what was this value on date X". */
export async function getCustomerVersions(
  db: Database,
  organizationId: string,
  customerId: string,
) {
  return db
    .select()
    .from(customerVersions)
    .where(
      and(
        eq(customerVersions.organizationId, organizationId),
        eq(customerVersions.customerId, customerId),
      ),
    )
    .orderBy(desc(customerVersions.version));
}

/** Per-customer activity timeline with WHO did it (brief §4.1). */
export async function getCustomerTimeline(
  db: Database,
  organizationId: string,
  customerId: string,
  limit = 50,
) {
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      actorType: auditLog.actorType,
      actorId: auditLog.actorId,
      actorName: user.name,
      changes: auditLog.changes,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorId))
    .where(
      and(
        eq(auditLog.organizationId, organizationId),
        eq(auditLog.entityType, "customer"),
        eq(auditLog.entityId, customerId),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

const OPEN_INVOICE_STATUSES = ["sent", "partial", "overdue"] as const;

/**
 * Outstanding receivables per currency (Zoho-style overview row). Grouped
 * by currency and never summed across currencies — display-side rows, no
 * conversion needed (§5.6).
 */
export async function getCustomerReceivables(
  db: Database,
  organizationId: string,
  customerId: string,
): Promise<Array<{ currency: string; outstanding: Money }>> {
  const rows = await db
    .select({
      currency: invoices.currency,
      totalMinor: invoices.totalMinor,
      amountPaidMinor: invoices.amountPaidMinor,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        eq(invoices.customerId, customerId),
        inArray(invoices.status, [...OPEN_INVOICE_STATUSES]),
        isNull(invoices.deletedAt),
      ),
    );
  const byCurrency = new Map<string, Money>();
  for (const row of rows) {
    const remaining = Money.fromMinor(row.totalMinor, row.currency).subtract(
      Money.fromMinor(row.amountPaidMinor, row.currency),
    );
    const prev = byCurrency.get(row.currency) ?? Money.zero(row.currency);
    byCurrency.set(row.currency, prev.add(remaining));
  }
  return [...byCurrency.entries()]
    .map(([currency, outstanding]) => ({ currency, outstanding }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Invoices and payments for the customer (Transactions tab). */
export async function getCustomerTransactions(
  db: Database,
  organizationId: string,
  customerId: string,
) {
  const customerInvoices = await db
    .select({
      id: invoices.id,
      displayNumber: invoices.displayNumber,
      status: invoices.status,
      currency: invoices.currency,
      totalMinor: invoices.totalMinor,
      amountPaidMinor: invoices.amountPaidMinor,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        eq(invoices.customerId, customerId),
        isNull(invoices.deletedAt),
      ),
    )
    .orderBy(desc(invoices.createdAt));

  const customerPayments = await db
    .select({
      id: payments.id,
      invoiceId: payments.invoiceId,
      amountMinor: payments.amountMinor,
      currency: payments.currency,
      method: payments.method,
      paidAt: payments.paidAt,
    })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(
      and(
        eq(payments.organizationId, organizationId),
        eq(invoices.customerId, customerId),
        // a payment on a voided/removed invoice must not appear either —
        // keep both sides of the ledger on the same filter
        notInArray(invoices.status, ["draft", "void"]),
        isNull(invoices.deletedAt),
        isNull(payments.deletedAt),
      ),
    )
    .orderBy(desc(payments.paidAt));

  return { invoices: customerInvoices, payments: customerPayments };
}

export interface StatementLine {
  date: Date;
  kind: "invoice" | "payment";
  reference: string;
  amount: Money; // invoices debit, payments credit
}

export interface CurrencyStatement {
  currency: string;
  opening: Money;
  invoiced: Money;
  received: Money;
  closing: Money;
  lines: StatementLine[];
}

/**
 * Statement of accounts for a period, per currency (amounts in different
 * currencies are never combined, §5.6). Opening balance = everything issued
 * minus everything received before the period start; issued documents only
 * (drafts and voids never appear on a statement).
 */
export async function getCustomerStatement(
  db: Database,
  organizationId: string,
  customerId: string,
  period: { from: Date; to: Date },
): Promise<CurrencyStatement[]> {
  const issuedFilter = and(
    eq(invoices.organizationId, organizationId),
    eq(invoices.customerId, customerId),
    notInArray(invoices.status, ["draft", "void"]),
    isNull(invoices.deletedAt),
  );

  const invoiceRows = await db
    .select({
      id: invoices.id,
      displayNumber: invoices.displayNumber,
      currency: invoices.currency,
      totalMinor: invoices.totalMinor,
      issuedAt: invoices.issuedAt,
    })
    .from(invoices)
    .where(issuedFilter);

  const paymentRows = await db
    .select({
      id: payments.id,
      currency: payments.currency,
      amountMinor: payments.amountMinor,
      paidAt: payments.paidAt,
    })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(
      and(
        eq(payments.organizationId, organizationId),
        eq(invoices.customerId, customerId),
        // same exclusion as the invoice side: a void/removed invoice takes
        // its payments off the statement with it
        notInArray(invoices.status, ["draft", "void"]),
        isNull(invoices.deletedAt),
        isNull(payments.deletedAt),
      ),
    );

  const statements = new Map<string, CurrencyStatement>();
  const bucket = (currency: string): CurrencyStatement => {
    let s = statements.get(currency);
    if (!s) {
      s = {
        currency,
        opening: Money.zero(currency),
        invoiced: Money.zero(currency),
        received: Money.zero(currency),
        closing: Money.zero(currency),
        lines: [],
      };
      statements.set(currency, s);
    }
    return s;
  };

  for (const inv of invoiceRows) {
    if (!inv.issuedAt) continue;
    const s = bucket(inv.currency);
    const amount = Money.fromMinor(inv.totalMinor, inv.currency);
    if (inv.issuedAt < period.from) {
      s.opening = s.opening.add(amount);
    } else if (inv.issuedAt >= period.from && inv.issuedAt < period.to) {
      s.invoiced = s.invoiced.add(amount);
      s.lines.push({
        date: inv.issuedAt,
        kind: "invoice",
        reference: inv.displayNumber ?? inv.id.slice(-8),
        amount,
      });
    }
  }
  for (const pay of paymentRows) {
    const s = bucket(pay.currency);
    const amount = Money.fromMinor(pay.amountMinor, pay.currency);
    if (pay.paidAt < period.from) {
      s.opening = s.opening.subtract(amount);
    } else if (pay.paidAt >= period.from && pay.paidAt < period.to) {
      s.received = s.received.add(amount);
      s.lines.push({
        date: pay.paidAt,
        kind: "payment",
        reference: pay.id.slice(-8),
        amount,
      });
    }
  }

  for (const s of statements.values()) {
    s.closing = s.opening.add(s.invoiced).subtract(s.received);
    s.lines.sort((a, b) => a.date.getTime() - b.date.getTime());
  }
  return [...statements.values()].sort((a, b) =>
    a.currency.localeCompare(b.currency),
  );
}

/**
 * Emails sent to this customer (Mails tab) — matched against ALL of the
 * customer's contact-person emails (contacts own contact info now).
 */
export async function getCustomerMails(
  db: Database,
  organizationId: string,
  customerId: string,
  limit = 50,
) {
  const contactEmails = await db
    .select({ email: customerContacts.email })
    .from(customerContacts)
    .where(
      and(
        eq(customerContacts.organizationId, organizationId),
        eq(customerContacts.customerId, customerId),
        isNull(customerContacts.deletedAt),
      ),
    );
  const emails = contactEmails
    .map((c) => c.email)
    .filter((e): e is string => Boolean(e));
  if (emails.length === 0) return [];
  return db
    .select({
      id: emailMessages.id,
      type: emailMessages.type,
      subject: emailMessages.subject,
      recipient: emailMessages.recipient,
      status: emailMessages.status,
      createdAt: emailMessages.createdAt,
    })
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.organizationId, organizationId),
        inArray(emailMessages.recipient, emails),
      ),
    )
    .orderBy(desc(emailMessages.createdAt))
    .limit(limit);
}

/** Customer list with the primary contact person (list pane display). */
export async function listCustomersWithPrimaryContact(
  db: Database,
  organizationId: string,
) {
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      contactName: customerContacts.firstName,
      contactLastName: customerContacts.lastName,
      contactEmail: customerContacts.email,
    })
    .from(customers)
    .leftJoin(
      customerContacts,
      and(
        eq(customerContacts.customerId, customers.id),
        eq(customerContacts.isPrimary, true),
        isNull(customerContacts.deletedAt),
      ),
    )
    .where(
      and(
        eq(customers.organizationId, organizationId),
        isNull(customers.deletedAt),
      ),
    )
    .orderBy(customers.name);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    primaryContact: r.contactName
      ? {
          name: [r.contactName, r.contactLastName].filter(Boolean).join(" "),
          email: r.contactEmail,
        }
      : null,
  }));
}
