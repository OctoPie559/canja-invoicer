import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import type { Database, Transaction } from "@/lib/db/client";
import { withOrgTransaction } from "@/lib/db/tx";
import { customerContacts, customers } from "@/lib/db/schema";
import { newId } from "@/lib/domain/ids";
import {
  ConflictError,
  NotFoundError,
  PermissionError,
} from "@/lib/domain/errors";
import { writeAudit } from "@/lib/audit/write";
import { changedFields } from "@/lib/audit/diff";
import type { ActorContext } from "@/lib/audit/context";
import { authorize } from "@/lib/authz/permissions";
import type { FileStorage } from "@/lib/storage/port";
import { getFileStorage } from "@/lib/storage/r2";
import {
  assertImageUpload,
  imageExtension,
} from "@/lib/storage/images";
import { getMembership } from "./organizations";
import {
  createContactSchema,
  deleteContactSchema,
  updateContactSchema,
  type ContactRowInput,
  type CreateContactInput,
  type DeleteContactInput,
  type UpdateContactInput,
  contactRowsSchema,
} from "@/lib/validation/contacts";

/**
 * Contact persons — the people reached about a customer's billing
 * (decision, 2026-07-05). Contact mutations ride the customer permissions
 * (customer.update): editing who to contact IS editing the customer.
 * Audit rows land on the customer's timeline. The partial unique index on
 * (customer_id) WHERE is_primary guarantees at most one primary at the DB;
 * the service demotes the old primary in the same transaction.
 */

const EDITABLE_FIELDS = [
  "salutation",
  "firstName",
  "lastName",
  "email",
  "workPhone",
  "mobile",
  "designation",
  "department",
  "isPrimary",
] as const;

async function assertCustomerInOrg(
  tx: Transaction,
  organizationId: string,
  customerId: string,
): Promise<void> {
  const [row] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.id, customerId),
        eq(customers.organizationId, organizationId),
        isNull(customers.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("customer");
}

/**
 * Demote the current primary (returns demoted ids for the promotion's audit
 * row). Bumps the demoted row's version so a concurrently open edit of it
 * hits the optimistic lock instead of silently writing over the demotion.
 */
async function demoteCurrentPrimary(
  tx: Transaction,
  organizationId: string,
  customerId: string,
  exceptContactId?: string,
): Promise<string[]> {
  const demoted = await tx
    .update(customerContacts)
    .set({
      isPrimary: false,
      updatedAt: new Date(),
      version: sql`${customerContacts.version} + 1`,
    })
    .where(
      and(
        eq(customerContacts.organizationId, organizationId),
        eq(customerContacts.customerId, customerId),
        eq(customerContacts.isPrimary, true),
        isNull(customerContacts.deletedAt),
        ...(exceptContactId ? [ne(customerContacts.id, exceptContactId)] : []),
      ),
    )
    .returning({ id: customerContacts.id });
  return demoted.map((d) => d.id);
}

/**
 * Two simultaneous promotions can both find nothing to demote; the partial
 * unique index stops the loser — surface that as a typed conflict.
 */
function mapPrimaryRace(error: unknown): never {
  for (let e = error; e instanceof Error; e = e.cause as Error | undefined) {
    if (e.message.includes("customer_contacts_primary_idx")) {
      throw new ConflictError("contact");
    }
  }
  throw error;
}

/** Insert a contact inside an existing org transaction (also used by
 *  createCustomer's inline primary contact). */
export async function insertContact(
  tx: Transaction,
  ctx: ActorContext,
  customerId: string,
  fields: {
    salutation?: string | null;
    firstName: string;
    lastName?: string | null;
    email?: string | null;
    workPhone?: string | null;
    mobile?: string | null;
    designation?: string | null;
    department?: string | null;
  },
  isPrimary: boolean,
): Promise<string> {
  const contactId = newId();
  let demoted: string[] = [];
  if (isPrimary) {
    demoted = await demoteCurrentPrimary(tx, ctx.organizationId, customerId);
  }
  try {
    await tx.insert(customerContacts).values({
      id: contactId,
      organizationId: ctx.organizationId,
      customerId,
      ...fields,
      isPrimary,
    });
  } catch (error) {
    mapPrimaryRace(error);
  }
  await writeAudit(tx, ctx, {
    action: "contact.added",
    entityType: "customer",
    entityId: customerId,
    changes: {
      after: {
        contactId,
        name: [fields.firstName, fields.lastName].filter(Boolean).join(" "),
        isPrimary,
      },
      ...(demoted.length > 0 ? { demotedPrimary: demoted } : {}),
    },
  });
  return contactId;
}

export async function createContact(
  db: Database,
  ctx: ActorContext,
  input: CreateContactInput,
): Promise<{ contactId: string }> {
  const data = createContactSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("customer.update");

  const contactId = await withOrgTransaction(
    db,
    ctx.organizationId,
    async (tx) => {
      const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
      authorize(caller.role, "customer.update");
      await assertCustomerInOrg(tx, ctx.organizationId, data.customerId);
      const { customerId, isPrimary, ...fields } = data;
      return insertContact(tx, ctx, customerId, fields, isPrimary);
    },
  );
  return { contactId };
}

export async function updateContact(
  db: Database,
  ctx: ActorContext,
  input: UpdateContactInput,
): Promise<void> {
  const data = updateContactSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("customer.update");

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "customer.update");

    const [current] = await tx
      .select()
      .from(customerContacts)
      .where(
        and(
          eq(customerContacts.id, data.id),
          eq(customerContacts.organizationId, ctx.organizationId),
          isNull(customerContacts.deletedAt),
        ),
      )
      .for("update");
    if (!current) throw new NotFoundError("contact");
    if (current.version !== data.version) throw new ConflictError("contact");

    const next = {
      salutation: data.salutation ?? null,
      firstName: data.firstName,
      lastName: data.lastName ?? null,
      email: data.email ?? null,
      workPhone: data.workPhone ?? null,
      mobile: data.mobile ?? null,
      designation: data.designation ?? null,
      department: data.department ?? null,
      isPrimary: data.isPrimary,
    };
    const diff = changedFields(current, next, EDITABLE_FIELDS);
    if (diff.changed.length === 0) return;

    let demoted: string[] = [];
    if (next.isPrimary && !current.isPrimary) {
      demoted = await demoteCurrentPrimary(
        tx,
        ctx.organizationId,
        current.customerId,
        current.id,
      );
    }
    try {
      await tx
        .update(customerContacts)
        .set({ ...next, version: current.version + 1, updatedAt: new Date() })
        .where(eq(customerContacts.id, data.id));
    } catch (error) {
      mapPrimaryRace(error);
    }
    await writeAudit(tx, ctx, {
      action: "contact.updated",
      entityType: "customer",
      entityId: current.customerId,
      changes: {
        before: diff.before,
        after: diff.after,
        ...(demoted.length > 0 ? { demotedPrimary: demoted } : {}),
      },
    });
  });
}

export async function deleteContact(
  db: Database,
  ctx: ActorContext,
  input: DeleteContactInput,
): Promise<void> {
  const data = deleteContactSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("customer.update");

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "customer.update");

    const [current] = await tx
      .select()
      .from(customerContacts)
      .where(
        and(
          eq(customerContacts.id, data.id),
          eq(customerContacts.organizationId, ctx.organizationId),
          isNull(customerContacts.deletedAt),
        ),
      )
      .for("update");
    if (!current) throw new NotFoundError("contact");
    if (current.version !== data.version) throw new ConflictError("contact");

    await tx
      .update(customerContacts)
      .set({
        deletedAt: new Date(),
        isPrimary: false,
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(customerContacts.id, data.id));
    await writeAudit(tx, ctx, {
      action: "contact.removed",
      entityType: "customer",
      entityId: current.customerId,
      changes: {
        before: {
          contactId: current.id,
          name: [current.firstName, current.lastName].filter(Boolean).join(" "),
        },
      },
    });
  });
}

/**
 * Apply a full contact-grid edit inside the CALLER's transaction (used by
 * the single-save edit-customer flow). Caller has already authorized
 * customer.update and verified the customer belongs to the org. Ordering:
 * deletions → updates → creations, so a primary moving from a removed row
 * to a new one never trips the partial unique index mid-flight.
 */
export async function applyContactChanges(
  tx: Transaction,
  ctx: ActorContext,
  customerId: string,
  rows: ContactRowInput[],
): Promise<void> {
  const data = contactRowsSchema.parse(rows);
  const wantsPrimary = data.some((r) => r.isPrimary && !r.deleted);
  let demotedIds: string[] = [];
  if (wantsPrimary) {
    const keepId = data.find((r) => r.isPrimary && !r.deleted)?.id ?? undefined;
    demotedIds = await demoteCurrentPrimary(
      tx,
      ctx.organizationId,
      customerId,
      keepId,
    );
  }

  const ordered = [
    ...data.filter((r) => r.deleted && r.id),
    ...data.filter((r) => !r.deleted && r.id),
    ...data.filter((r) => !r.deleted && !r.id),
  ];

  for (const row of ordered) {
    if (row.id) {
      const [current] = await tx
        .select()
        .from(customerContacts)
        .where(
          and(
            eq(customerContacts.id, row.id),
            eq(customerContacts.organizationId, ctx.organizationId),
            eq(customerContacts.customerId, customerId),
            isNull(customerContacts.deletedAt),
          ),
        )
        .for("update");
      if (!current) throw new NotFoundError("contact");
      // the demotion above bumped rows WE touched in this transaction —
      // exactly those may be one version ahead of the client's copy; any
      // other mismatch is a genuine concurrent edit
      const expectedVersion =
        (row.version ?? 0) + (demotedIds.includes(row.id) ? 1 : 0);
      if (current.version !== expectedVersion) {
        throw new ConflictError("contact");
      }

      if (row.deleted) {
        await tx
          .update(customerContacts)
          .set({
            deletedAt: new Date(),
            isPrimary: false,
            version: current.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(customerContacts.id, row.id));
        await writeAudit(tx, ctx, {
          action: "contact.removed",
          entityType: "customer",
          entityId: customerId,
          changes: {
            before: {
              contactId: current.id,
              name: [current.firstName, current.lastName]
                .filter(Boolean)
                .join(" "),
            },
          },
        });
        continue;
      }

      const next = {
        salutation: row.salutation ?? null,
        firstName: row.firstName,
        lastName: row.lastName ?? null,
        email: row.email ?? null,
        workPhone: row.workPhone ?? null,
        mobile: row.mobile ?? null,
        designation: row.designation ?? null,
        department: row.department ?? null,
        isPrimary: row.isPrimary,
      };
      const diff = changedFields(current, next, EDITABLE_FIELDS);
      if (diff.changed.length === 0) continue;
      try {
        await tx
          .update(customerContacts)
          .set({ ...next, version: current.version + 1, updatedAt: new Date() })
          .where(eq(customerContacts.id, row.id));
      } catch (error) {
        mapPrimaryRace(error);
      }
      await writeAudit(tx, ctx, {
        action: "contact.updated",
        entityType: "customer",
        entityId: customerId,
        changes: { before: diff.before, after: diff.after },
      });
    } else if (!row.deleted) {
      await insertContact(
        tx,
        ctx,
        customerId,
        {
          salutation: row.salutation,
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          workPhone: row.workPhone,
          mobile: row.mobile,
          designation: row.designation,
          department: row.department,
        },
        row.isPrimary,
      );
    }
  }
}

/** Contacts for a customer, primary first. */
export async function listContacts(
  db: Database,
  organizationId: string,
  customerId: string,
) {
  const rows = await db
    .select()
    .from(customerContacts)
    .where(
      and(
        eq(customerContacts.organizationId, organizationId),
        eq(customerContacts.customerId, customerId),
        isNull(customerContacts.deletedAt),
      ),
    )
    .orderBy(asc(customerContacts.createdAt));
  return rows.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
}

export interface ContactPhotoDeps {
  storage?: FileStorage;
}

/**
 * Profile photo for a contact person. Unlike branding logos (whose keys
 * are frozen into issue snapshots), contact photos are referenced ONLY by
 * the live row — so the superseded object is deleted after commit: photos
 * are personal data, and keeping unreachable copies would violate the
 * data-minimization posture (§7).
 */
export async function uploadContactPhoto(
  db: Database,
  ctx: ActorContext,
  input: { contactId: string; bytes: Uint8Array; contentType: string },
  deps: ContactPhotoDeps = {},
): Promise<{ photoKey: string }> {
  if (!ctx.actorId) throw new PermissionError("customer.update");
  assertImageUpload(input.bytes, input.contentType);
  const storage = deps.storage ?? getFileStorage();
  const photoKey = `orgs/${ctx.organizationId}/contacts/${input.contactId}/photo-${newId()}.${imageExtension(input.contentType as never)}`;

  // authorization and existence BEFORE the storage side effect
  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "customer.update");
    const [row] = await tx
      .select({ id: customerContacts.id })
      .from(customerContacts)
      .where(
        and(
          eq(customerContacts.id, input.contactId),
          eq(customerContacts.organizationId, ctx.organizationId),
          isNull(customerContacts.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundError("Contact person");
  });

  await storage.put({
    key: photoKey,
    body: input.bytes,
    contentType: input.contentType,
  });

  let previousKey: string | null = null;
  try {
    await withOrgTransaction(db, ctx.organizationId, async (tx) => {
      const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
      authorize(caller.role, "customer.update");
      const [before] = await tx
        .select()
        .from(customerContacts)
        .where(
          and(
            eq(customerContacts.id, input.contactId),
            eq(customerContacts.organizationId, ctx.organizationId),
            isNull(customerContacts.deletedAt),
          ),
        )
        .for("update");
      if (!before) throw new NotFoundError("Contact person");
      previousKey = before.photoKey;

      await tx
        .update(customerContacts)
        .set({
          photoKey,
          version: before.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(customerContacts.id, input.contactId));
      await writeAudit(tx, ctx, {
        action: "contact.photo_updated",
        entityType: "contact",
        entityId: input.contactId,
        changes: { before: { photoKey: before.photoKey }, after: { photoKey } },
      });
    });
  } catch (error) {
    await storage.delete(photoKey).catch(() => {});
    throw error;
  }

  if (previousKey) {
    await storage.delete(previousKey).catch(() => {
      // best-effort: an orphaned photo is swept by lifecycle rules
    });
  }
  return { photoKey };
}

export async function removeContactPhoto(
  db: Database,
  ctx: ActorContext,
  input: { contactId: string },
  deps: ContactPhotoDeps = {},
): Promise<void> {
  if (!ctx.actorId) throw new PermissionError("customer.update");
  const storage = deps.storage ?? getFileStorage();

  let key: string | null = null;
  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "customer.update");
    const [before] = await tx
      .select()
      .from(customerContacts)
      .where(
        and(
          eq(customerContacts.id, input.contactId),
          eq(customerContacts.organizationId, ctx.organizationId),
          isNull(customerContacts.deletedAt),
        ),
      )
      .for("update");
    if (!before) throw new NotFoundError("Contact person");
    if (!before.photoKey) return;
    key = before.photoKey;

    await tx
      .update(customerContacts)
      .set({ photoKey: null, version: before.version + 1, updatedAt: new Date() })
      .where(eq(customerContacts.id, input.contactId));
    await writeAudit(tx, ctx, {
      action: "contact.photo_removed",
      entityType: "contact",
      entityId: input.contactId,
      changes: { before: { photoKey: key }, after: { photoKey: null } },
    });
  });

  if (key) {
    await storage.delete(key).catch(() => {});
  }
}

/** photoKey → public URL; null when storage is not configured. */
export function contactPhotoUrl(
  photoKey: string | null | undefined,
): string | null {
  if (!photoKey) return null;
  try {
    return getFileStorage().publicUrl(photoKey);
  } catch {
    return null;
  }
}
