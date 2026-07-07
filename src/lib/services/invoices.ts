import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, ilike, isNull, or, sql } from "drizzle-orm";
import type { Database, Transaction } from "@/lib/db/client";
import { withOrgTransaction } from "@/lib/db/tx";
import {
  auditLog,
  customerContacts,
  customers,
  invoiceLineItems,
  invoices,
  organizationBranding,
  organizationSettings,
  subscriptions,
  user,
} from "@/lib/db/schema";
import { newId } from "@/lib/domain/ids";
import { Money } from "@/lib/domain/money";
import {
  computeInvoiceTotals,
  type LineInput,
} from "@/lib/domain/invoice-math";
import {
  assertTransition,
  isDeletable,
  isEditable,
  type InvoiceStatus,
} from "@/lib/domain/invoice-status";
import {
  ConflictError,
  ImmutableDocumentError,
  NotFoundError,
  PermissionError,
  ValidationError,
} from "@/lib/domain/errors";
import { writeAudit } from "@/lib/audit/write";
import { jsonSafe } from "@/lib/audit/diff";
import type { ActorContext } from "@/lib/audit/context";
import { authorize } from "@/lib/authz/permissions";
import {
  requireEntitlement,
  requireWithinCap,
  type Plan,
} from "@/lib/authz/entitlements";
import { getMembership } from "./organizations";
import {
  createInvoiceDraftSchema,
  deleteInvoiceDraftSchema,
  issueInvoiceSchema,
  updateInvoiceDraftSchema,
  voidInvoiceSchema,
  type CreateInvoiceDraftInput,
  type DeleteInvoiceDraftInput,
  type IssueInvoiceInput,
  type UpdateInvoiceDraftInput,
  type VoidInvoiceInput,
} from "@/lib/validation/invoices";

/**
 * Invoice lifecycle (brief §104, ARCHITECTURE.md §8 slice 2).
 *
 * Drafts are working documents: editable, deletable, recomputed on every
 * save. Issue is the one-way door — it assigns the display number under
 * FOR UPDATE, freezes totals, snapshots every dependency (customer,
 * branding, lines, FX), and from then on the document is immutable
 * (brief §5.3). Corrections to an issued invoice are credit notes or new
 * documents, never edits. Every mutation writes its audit row in the same
 * transaction.
 */

// ---------------------------------------------------------------------------
// shared helpers

interface OrgBillingContext {
  baseCurrency: string;
  plan: Plan;
}

async function getBillingContext(
  tx: Transaction,
  organizationId: string,
): Promise<OrgBillingContext> {
  const [settings] = await tx
    .select({ baseCurrency: organizationSettings.baseCurrency })
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, organizationId))
    .limit(1);
  if (!settings) throw new NotFoundError("Organization settings");
  const [sub] = await tx
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);
  return {
    baseCurrency: settings.baseCurrency,
    plan: (sub?.plan ?? "free") as Plan,
  };
}

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
  if (!row) throw new NotFoundError("Customer");
}

/** Parsed draft line → domain input + row values, in submitted order. */
function toLineInputs(
  lines: Array<{
    quantity: string;
    unitPrice: string;
    discountBps: number;
    taxRateBps: number;
  }>,
  currency: string,
): LineInput[] {
  return lines.map((l) => ({
    quantity: l.quantity,
    unitPriceMinor: Money.parse(l.unitPrice, currency).amountMinor,
    discountBps: l.discountBps,
    taxRateBps: l.taxRateBps,
  }));
}

async function lockInvoice(
  tx: Transaction,
  organizationId: string,
  id: string,
): Promise<typeof invoices.$inferSelect> {
  const [row] = await tx
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.id, id),
        eq(invoices.organizationId, organizationId),
        isNull(invoices.deletedAt),
      ),
    )
    .for("update");
  if (!row) throw new NotFoundError("Invoice");
  return row;
}

// ---------------------------------------------------------------------------
// draft lifecycle

export async function createInvoiceDraft(
  db: Database,
  ctx: ActorContext,
  input: CreateInvoiceDraftInput,
): Promise<{ invoiceId: string }> {
  const data = createInvoiceDraftSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("invoice.create");
  const invoiceId = newId();

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "invoice.create");
    const org = await getBillingContext(tx, ctx.organizationId);
    if (data.currency !== org.baseCurrency) {
      requireEntitlement(org.plan, "multiCurrency");
    }
    await assertCustomerInOrg(tx, ctx.organizationId, data.customerId);

    const totals = computeInvoiceTotals(
      toLineInputs(data.lines, data.currency),
      data.currency,
    );

    await tx.insert(invoices).values({
      id: invoiceId,
      organizationId: ctx.organizationId,
      customerId: data.customerId,
      status: "draft",
      currency: data.currency,
      issueDate: data.issueDate,
      dueDate: data.dueDate,
      subtotalMinor: totals.subtotal.amountMinor,
      discountTotalMinor: totals.discountTotal.amountMinor,
      taxTotalMinor: totals.taxTotal.amountMinor,
      totalMinor: totals.total.amountMinor,
      amountPaidMinor: 0n,
      notes: data.notes,
      terms: data.terms,
    });
    await insertLines(tx, ctx.organizationId, invoiceId, data);

    await writeAudit(tx, ctx, {
      action: "invoice.created",
      entityType: "invoice",
      entityId: invoiceId,
      changes: {
        after: jsonSafe({
          customerId: data.customerId,
          currency: data.currency,
          totalMinor: totals.total.amountMinor,
          lineCount: data.lines.length,
        }),
      },
    });
  });
  return { invoiceId };
}

async function insertLines(
  tx: Transaction,
  organizationId: string,
  invoiceId: string,
  data: {
    currency: string;
    lines: Array<{
      productId?: string | null;
      description: string;
      quantity: string;
      unitPrice: string;
      discountBps: number;
      taxRateBps: number;
    }>;
  },
): Promise<void> {
  await tx.insert(invoiceLineItems).values(
    data.lines.map((l, i) => ({
      id: newId(),
      organizationId,
      invoiceId,
      productId: l.productId ?? null,
      description: l.description,
      quantity: l.quantity,
      unitPriceMinor: Money.parse(l.unitPrice, data.currency).amountMinor,
      discountBps: l.discountBps,
      taxRateBps: l.taxRateBps,
      lineTotalMinor: (() => {
        const totals = computeInvoiceTotals(
          toLineInputs([l], data.currency),
          data.currency,
        );
        return totals.total.amountMinor;
      })(),
      position: i,
    })),
  );
}

export async function updateInvoiceDraft(
  db: Database,
  ctx: ActorContext,
  input: UpdateInvoiceDraftInput,
): Promise<void> {
  const data = updateInvoiceDraftSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("invoice.update");

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "invoice.update");
    const before = await lockInvoice(tx, ctx.organizationId, data.id);
    if (!isEditable(before.status as InvoiceStatus)) {
      throw new ImmutableDocumentError("Invoice");
    }
    if (before.version !== data.version) throw new ConflictError("Invoice");

    const org = await getBillingContext(tx, ctx.organizationId);
    if (data.currency !== org.baseCurrency) {
      requireEntitlement(org.plan, "multiCurrency");
    }
    await assertCustomerInOrg(tx, ctx.organizationId, data.customerId);

    const totals = computeInvoiceTotals(
      toLineInputs(data.lines, data.currency),
      data.currency,
    );

    // drafts are working documents — replace lines wholesale in the same tx;
    // history for drafts is the audit trail, not row archaeology
    await tx
      .delete(invoiceLineItems)
      .where(
        and(
          eq(invoiceLineItems.invoiceId, data.id),
          eq(invoiceLineItems.organizationId, ctx.organizationId),
        ),
      );
    await insertLines(tx, ctx.organizationId, data.id, data);

    await tx
      .update(invoices)
      .set({
        customerId: data.customerId,
        currency: data.currency,
        issueDate: data.issueDate,
        dueDate: data.dueDate,
        subtotalMinor: totals.subtotal.amountMinor,
        discountTotalMinor: totals.discountTotal.amountMinor,
        taxTotalMinor: totals.taxTotal.amountMinor,
        totalMinor: totals.total.amountMinor,
        notes: data.notes,
        terms: data.terms,
        version: before.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, data.id));

    await writeAudit(tx, ctx, {
      action: "invoice.updated",
      entityType: "invoice",
      entityId: data.id,
      changes: {
        before: jsonSafe({
          customerId: before.customerId,
          currency: before.currency,
          totalMinor: before.totalMinor,
        }),
        after: jsonSafe({
          customerId: data.customerId,
          currency: data.currency,
          totalMinor: totals.total.amountMinor,
          lineCount: data.lines.length,
        }),
      },
    });
  });
}

export async function deleteInvoiceDraft(
  db: Database,
  ctx: ActorContext,
  input: DeleteInvoiceDraftInput,
): Promise<void> {
  const data = deleteInvoiceDraftSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("invoice.update");

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "invoice.update");
    const before = await lockInvoice(tx, ctx.organizationId, data.id);
    if (!isDeletable(before.status as InvoiceStatus)) {
      // issued documents are annulled with a reason (void), never deleted
      throw new ImmutableDocumentError("Invoice");
    }
    if (before.version !== data.version) throw new ConflictError("Invoice");

    const now = new Date();
    await tx
      .update(invoiceLineItems)
      .set({ deletedAt: now })
      .where(
        and(
          eq(invoiceLineItems.invoiceId, data.id),
          eq(invoiceLineItems.organizationId, ctx.organizationId),
        ),
      );
    await tx
      .update(invoices)
      .set({ deletedAt: now, version: before.version + 1 })
      .where(eq(invoices.id, data.id));

    await writeAudit(tx, ctx, {
      action: "invoice.deleted",
      entityType: "invoice",
      entityId: data.id,
      changes: {
        before: jsonSafe({
          customerId: before.customerId,
          totalMinor: before.totalMinor,
          status: before.status,
        }),
      },
    });
  });
}

// ---------------------------------------------------------------------------
// issue — the one-way door

/** Unguessable token for the hosted public view (slice 3). */
function newPublicToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function issueInvoice(
  db: Database,
  ctx: ActorContext,
  input: IssueInvoiceInput,
): Promise<{ displayNumber: string }> {
  const data = issueInvoiceSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("invoice.issue");
  if (data.dueDate < data.issueDate) {
    throw new ValidationError("Due date cannot be before the issue date");
  }

  return withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "invoice.issue");
    const invoice = await lockInvoice(tx, ctx.organizationId, data.id);
    assertTransition(invoice.status as InvoiceStatus, "sent");
    if (invoice.version !== data.version) throw new ConflictError("Invoice");

    const org = await getBillingContext(tx, ctx.organizationId);

    // FX discipline (§5.6): foreign-currency invoices carry their rate to
    // base, frozen here; base-currency invoices must not carry one.
    const foreign = invoice.currency !== org.baseCurrency;
    if (foreign) {
      requireEntitlement(org.plan, "multiCurrency");
      if (!data.fxRateToBase) {
        throw new ValidationError(
          `An FX rate to ${org.baseCurrency} is required to issue a ${invoice.currency} invoice`,
        );
      }
    } else if (data.fxRateToBase) {
      throw new ValidationError(
        "A base-currency invoice does not take an FX rate",
      );
    }

    // the counter lock comes FIRST: it serializes concurrent issues for
    // this org, which also makes the monthly-cap count below race-free
    // (two issues at cap-1 would otherwise both pass the check)
    const [settings] = await tx
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, ctx.organizationId))
      .for("update");
    if (!settings) throw new NotFoundError("Organization settings");

    // free-tier monthly cap counts invoices ISSUED this calendar month
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [issued] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, ctx.organizationId),
          gte(invoices.issuedAt, monthStart),
        ),
      );
    requireWithinCap(org.plan, "monthlyInvoiceCap", issued?.count ?? 0);

    const lines = await tx
      .select()
      .from(invoiceLineItems)
      .where(
        and(
          eq(invoiceLineItems.invoiceId, invoice.id),
          eq(invoiceLineItems.organizationId, ctx.organizationId),
          isNull(invoiceLineItems.deletedAt),
        ),
      )
      .orderBy(asc(invoiceLineItems.position));
    if (lines.length === 0) {
      throw new ValidationError("An invoice needs at least one line item");
    }

    // recompute totals from the stored lines — the frozen numbers must come
    // from what the document actually contains, not from a stale column
    const totals = computeInvoiceTotals(
      lines.map((l) => ({
        quantity: l.quantity,
        unitPriceMinor: l.unitPriceMinor ?? 0n,
        discountBps: l.discountBps,
        taxRateBps: l.taxRateBps,
      })),
      invoice.currency,
    );

    // display number from the counter locked above — race-safe by
    // construction; the partial unique index is the backstop
    const displayNumber = `${settings.invoicePrefix}-${String(
      settings.invoiceNextNumber,
    ).padStart(6, "0")}`;
    await tx
      .update(organizationSettings)
      .set({
        invoiceNextNumber: settings.invoiceNextNumber + 1,
        updatedAt: new Date(),
      })
      .where(eq(organizationSettings.organizationId, ctx.organizationId));

    // Layer-2 snapshot (§5.3): everything the document depends on, copied.
    // Historical invoices never change when the customer, branding, or
    // rates change later.
    const [customer] = await tx
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, invoice.customerId),
          eq(customers.organizationId, ctx.organizationId),
        ),
      );
    if (!customer) throw new NotFoundError("Customer");
    const [primaryContact] = await tx
      .select({
        firstName: customerContacts.firstName,
        lastName: customerContacts.lastName,
        email: customerContacts.email,
      })
      .from(customerContacts)
      .where(
        and(
          eq(customerContacts.customerId, customer.id),
          eq(customerContacts.isPrimary, true),
          isNull(customerContacts.deletedAt),
        ),
      )
      .limit(1);
    const [branding] = await tx
      .select()
      .from(organizationBranding)
      .where(eq(organizationBranding.organizationId, ctx.organizationId));

    const snapshot = jsonSafe({
      customer: {
        name: customer.name,
        customerType: customer.customerType,
        addressLine1: customer.addressLine1,
        addressLine2: customer.addressLine2,
        city: customer.city,
        country: customer.country,
        shippingAddressLine1: customer.shippingAddressLine1,
        shippingAddressLine2: customer.shippingAddressLine2,
        shippingCity: customer.shippingCity,
        shippingCountry: customer.shippingCountry,
        primaryContact: primaryContact ?? null,
      },
      branding: branding
        ? {
            legalName: branding.legalName,
            addressLine1: branding.addressLine1,
            addressLine2: branding.addressLine2,
            city: branding.city,
            country: branding.country,
            kraPin: branding.kraPin,
            contactEmail: branding.contactEmail,
            contactPhone: branding.contactPhone,
            accentColor: branding.accentColor,
            logoKey: branding.logoKey,
          }
        : null,
      lines: lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPriceMinor: l.unitPriceMinor,
        discountBps: l.discountBps,
        taxRateBps: l.taxRateBps,
        lineTotalMinor: l.lineTotalMinor,
        position: l.position,
      })),
      totals: {
        subtotalMinor: totals.subtotal.amountMinor,
        discountTotalMinor: totals.discountTotal.amountMinor,
        taxTotalMinor: totals.taxTotal.amountMinor,
        totalMinor: totals.total.amountMinor,
      },
      currency: invoice.currency,
      baseCurrency: org.baseCurrency,
      fxRateToBase: foreign ? data.fxRateToBase : null,
      issueDate: data.issueDate,
      dueDate: data.dueDate,
      displayNumber,
      // part of the rendered document (slice-3 PDF/public view builds from
      // this snapshot alone), so they freeze with everything else
      notes: invoice.notes,
      terms: invoice.terms,
    });

    await tx
      .update(invoices)
      .set({
        status: "sent",
        displayNumber,
        issueDate: data.issueDate,
        dueDate: data.dueDate,
        fxRateToBase: foreign ? data.fxRateToBase : null,
        subtotalMinor: totals.subtotal.amountMinor,
        discountTotalMinor: totals.discountTotal.amountMinor,
        taxTotalMinor: totals.taxTotal.amountMinor,
        totalMinor: totals.total.amountMinor,
        publicToken: newPublicToken(),
        snapshot,
        issuedAt: new Date(),
        version: invoice.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoice.id));

    await writeAudit(tx, ctx, {
      action: "invoice.issued",
      entityType: "invoice",
      entityId: invoice.id,
      changes: {
        after: jsonSafe({
          displayNumber,
          currency: invoice.currency,
          fxRateToBase: foreign ? data.fxRateToBase : null,
          totalMinor: totals.total.amountMinor,
          issueDate: data.issueDate,
          dueDate: data.dueDate,
        }),
      },
    });

    return { displayNumber };
  });
}

export async function voidInvoice(
  db: Database,
  ctx: ActorContext,
  input: VoidInvoiceInput,
): Promise<void> {
  const data = voidInvoiceSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("invoice.void");

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "invoice.void");
    const invoice = await lockInvoice(tx, ctx.organizationId, data.id);
    assertTransition(invoice.status as InvoiceStatus, "void");

    // void annuls the document but never rewrites it: the snapshot, totals,
    // and display number stay exactly as issued
    await tx
      .update(invoices)
      .set({ status: "void", updatedAt: new Date() })
      .where(eq(invoices.id, invoice.id));

    await writeAudit(tx, ctx, {
      action: "invoice.voided",
      entityType: "invoice",
      entityId: invoice.id,
      changes: {
        before: { status: invoice.status },
        after: { status: "void" },
      },
      reason: data.reason,
    });
  });
}

// ---------------------------------------------------------------------------
// reads

export interface InvoiceListFilters {
  status?: InvoiceStatus;
  customerId?: string;
  /** Matches display number or customer name. */
  q?: string;
}

export async function listInvoices(
  db: Database,
  organizationId: string,
  filters: InvoiceListFilters = {},
) {
  const conditions = [
    eq(invoices.organizationId, organizationId),
    isNull(invoices.deletedAt),
  ];
  if (filters.status) conditions.push(eq(invoices.status, filters.status));
  if (filters.customerId) {
    conditions.push(eq(invoices.customerId, filters.customerId));
  }
  if (filters.q) {
    const pattern = `%${filters.q}%`;
    const search = or(
      ilike(invoices.displayNumber, pattern),
      ilike(customers.name, pattern),
    );
    if (search) conditions.push(search);
  }

  return db
    .select({
      id: invoices.id,
      displayNumber: invoices.displayNumber,
      status: invoices.status,
      currency: invoices.currency,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      totalMinor: invoices.totalMinor,
      amountPaidMinor: invoices.amountPaidMinor,
      customerId: invoices.customerId,
      customerName: customers.name,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .where(and(...conditions))
    .orderBy(desc(invoices.createdAt));
}

export async function getInvoice(
  db: Database,
  organizationId: string,
  invoiceId: string,
) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.id, invoiceId),
        eq(invoices.organizationId, organizationId),
        isNull(invoices.deletedAt),
      ),
    )
    .limit(1);
  if (!invoice) return null;
  const [customer] = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(eq(customers.id, invoice.customerId))
    .limit(1);
  const lines = await db
    .select()
    .from(invoiceLineItems)
    .where(
      and(
        eq(invoiceLineItems.invoiceId, invoiceId),
        eq(invoiceLineItems.organizationId, organizationId),
        isNull(invoiceLineItems.deletedAt),
      ),
    )
    .orderBy(asc(invoiceLineItems.position));
  return { ...invoice, customer: customer ?? null, lines };
}

export async function getInvoiceTimeline(
  db: Database,
  organizationId: string,
  invoiceId: string,
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
      reason: auditLog.reason,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorId))
    .where(
      and(
        eq(auditLog.organizationId, organizationId),
        eq(auditLog.entityType, "invoice"),
        eq(auditLog.entityId, invoiceId),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

/** Count of invoices issued this calendar month — free-cap UI hint. */
export async function issuedThisMonth(
  db: Database,
  organizationId: string,
): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        gte(invoices.issuedAt, monthStart),
      ),
    );
  return row?.count ?? 0;
}
