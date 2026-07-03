import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { withOrgTransaction } from "@/lib/db/tx";
import { auditLog, customers, customerVersions } from "@/lib/db/schema";
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
  "email",
  "phone",
  "addressLine1",
  "addressLine2",
  "city",
  "country",
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

    await tx.insert(customers).values({
      id: customerId,
      organizationId: ctx.organizationId,
      ...data,
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
      changes: { after: jsonSafe({ ...data }) },
    });
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

    const { id: _id, version: _v, ...fields } = data;
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

/** Per-customer activity timeline straight from the audit log. */
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
      changes: auditLog.changes,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
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
