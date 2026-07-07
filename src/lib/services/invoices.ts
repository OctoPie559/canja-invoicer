import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { Database, Transaction } from "@/lib/db/client";
import { withOrgTransaction } from "@/lib/db/tx";
import {
  auditLog,
  customerContacts,
  customers,
  emailMessages,
  invoiceLineItems,
  invoices,
  organization,
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
  sendInvoiceSchema,
  updateInvoiceDraftSchema,
  voidInvoiceSchema,
  type CreateInvoiceDraftInput,
  type DeleteInvoiceDraftInput,
  type IssueInvoiceInput,
  type SendInvoiceInput,
  type UpdateInvoiceDraftInput,
  type VoidInvoiceInput,
} from "@/lib/validation/invoices";
import {
  getEmailSender,
  type EmailAttachment,
  type EmailSender,
} from "@/lib/email/port";
import {
  parseInvoiceSnapshot,
  type InvoiceSnapshot,
} from "@/lib/domain/invoice-snapshot";
import { appBaseUrl } from "@/lib/config";
import { maskPiiInText } from "@/lib/domain/pii";
import { getFileStorage } from "@/lib/storage/r2";

/** Snapshot logoKey → public URL; null when storage is not configured. */
function resolveLogoUrl(logoKey: string | null | undefined): string | null {
  if (!logoKey) return null;
  try {
    return getFileStorage().publicUrl(logoKey);
  } catch {
    return null;
  }
}

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
      paymentTermsDays: data.paymentTermsDays ?? null,
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
        paymentTermsDays: data.paymentTermsDays ?? null,
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
      paymentTermsDays: invoice.paymentTermsDays,
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

// ---------------------------------------------------------------------------
// slice 3: hosted view, PDF data, send

/**
 * Public lookup by unguessable token — the token IS the capability, so no
 * org context (this backs the unauthenticated /i/[token] page). Drafts have
 * no token and are structurally unreachable; voided documents stay visible
 * (the page labels them) because a customer may hold the link.
 */
export async function getInvoiceByPublicToken(db: Database, token: string) {
  if (!token || token.length < 20) return null;
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.publicToken, token), isNull(invoices.deletedAt)))
    .limit(1);
  if (!invoice || invoice.status === "draft" || !invoice.snapshot) return null;
  const [sub] = await db
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, invoice.organizationId))
    .limit(1);
  const snapshot = parseInvoiceSnapshot(invoice.snapshot);
  return {
    snapshot,
    status: invoice.status as InvoiceStatus,
    amountPaidMinor: invoice.amountPaidMinor ?? 0n,
    // free-plan documents carry the invoicer footer (brief §4.4)
    watermark: ((sub?.plan ?? "free") as Plan) === "free",
    logoUrl: resolveLogoUrl(snapshot.branding?.logoKey),
  };
}

/** Snapshot + watermark flag for the authenticated PDF download. */
export async function getInvoicePdfData(
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
  if (!invoice || !invoice.snapshot) return null; // drafts have no document
  const [sub] = await db
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);
  const snapshot = parseInvoiceSnapshot(invoice.snapshot);
  return {
    snapshot,
    status: invoice.status as InvoiceStatus,
    displayNumber: invoice.displayNumber!,
    watermark: ((sub?.plan ?? "free") as Plan) === "free",
    logoUrl: resolveLogoUrl(snapshot.branding?.logoKey),
  };
}

/** Statuses whose document may be emailed: issued and not annulled. */
const SENDABLE: readonly InvoiceStatus[] = ["sent", "partial", "overdue", "paid"];

/** Org-wide cap on invoice emails per hour (brief §6: rate-limit sends). */
const SEND_HOURLY_CAP = 30;

export interface RenderedInvoiceEmail {
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}

/**
 * Transport injects the rich react-email + PDF builder; the default is
 * framework-free plain text so this module never imports JSX (the same
 * pattern as invitations).
 */
export type InvoiceEmailBuilder = (params: {
  snapshot: InvoiceSnapshot;
  status: InvoiceStatus;
  publicUrl: string;
  organizationName: string;
  watermark: boolean;
}) => Promise<RenderedInvoiceEmail>;

const plainInvoiceEmail: InvoiceEmailBuilder = async ({
  snapshot,
  publicUrl,
  organizationName,
}) => ({
  subject: `Invoice ${snapshot.displayNumber} from ${organizationName}`,
  text:
    `${organizationName} sent you invoice ${snapshot.displayNumber} for ` +
    `${Money.fromMinor(BigInt(snapshot.totals.totalMinor), snapshot.currency).toString()}, ` +
    `due ${snapshot.dueDate}.\n\nView it online: ${publicUrl}`,
});

export interface SendInvoiceDeps {
  emailSender?: EmailSender;
  baseUrl?: string;
  buildEmail?: InvoiceEmailBuilder;
}

export async function sendInvoice(
  db: Database,
  ctx: ActorContext,
  input: SendInvoiceInput,
  deps: SendInvoiceDeps = {},
): Promise<{ recipients: string[] }> {
  const data = sendInvoiceSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("invoice.send");
  const emailSender = deps.emailSender ?? getEmailSender();
  const baseUrl = deps.baseUrl ?? appBaseUrl();
  const buildEmail = deps.buildEmail ?? plainInvoiceEmail;

  const prepared = await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "invoice.send");

    // sending-domain reputation gate (brief §6): unverified accounts
    // cannot put email on the wire
    const [sender] = await tx
      .select({ emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, ctx.actorId!));
    if (!sender?.emailVerified) {
      throw new ValidationError(
        "Verify your email address before sending invoices",
      );
    }

    const invoice = await lockInvoice(tx, ctx.organizationId, data.id);
    if (!SENDABLE.includes(invoice.status as InvoiceStatus)) {
      throw new ValidationError(
        invoice.status === "draft"
          ? "Issue the invoice before sending it"
          : "A void invoice cannot be sent",
      );
    }
    const snapshot = parseInvoiceSnapshot(invoice.snapshot);

    // recipients come from the customer's contact persons only
    const contacts = await tx
      .select({
        id: customerContacts.id,
        firstName: customerContacts.firstName,
        email: customerContacts.email,
      })
      .from(customerContacts)
      .where(
        and(
          eq(customerContacts.organizationId, ctx.organizationId),
          eq(customerContacts.customerId, invoice.customerId),
          inArray(customerContacts.id, data.contactIds),
          isNull(customerContacts.deletedAt),
        ),
      );
    if (contacts.length !== data.contactIds.length) {
      throw new NotFoundError("Contact person");
    }
    const recipients = contacts
      .map((c) => c.email)
      .filter((e): e is string => Boolean(e));
    if (recipients.length === 0) {
      throw new ValidationError(
        "None of the selected contact persons has an email address",
      );
    }

    // org-wide hourly cap protects the sending domain
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [recent] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(emailMessages)
      .where(
        and(
          eq(emailMessages.organizationId, ctx.organizationId),
          eq(emailMessages.type, "invoice_send"),
          gte(emailMessages.createdAt, hourAgo),
        ),
      );
    if ((recent?.count ?? 0) + recipients.length > SEND_HOURLY_CAP) {
      throw new ValidationError(
        "Sending limit reached — try again in a little while",
      );
    }

    const [org] = await tx
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, ctx.organizationId));
    const [sub] = await tx
      .select({ plan: subscriptions.plan })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, ctx.organizationId));

    const messageIds = recipients.map(() => newId());
    await tx.insert(emailMessages).values(
      recipients.map((recipient, i) => ({
        id: messageIds[i],
        organizationId: ctx.organizationId,
        type: "invoice_send",
        recipient,
        subject: `Invoice ${snapshot.displayNumber}`,
        entityType: "invoice",
        entityId: invoice.id,
        status: "queued",
      })),
    );
    await writeAudit(tx, ctx, {
      action: "invoice.sent",
      entityType: "invoice",
      entityId: invoice.id,
      changes: {
        after: { recipients, displayNumber: snapshot.displayNumber },
      },
    });

    return {
      snapshot,
      status: invoice.status as InvoiceStatus,
      publicToken: invoice.publicToken!,
      recipients,
      messageIds,
      organizationName: org?.name ?? "Your vendor",
      watermark: ((sub?.plan ?? "free") as Plan) === "free",
    };
  });

  // side effects after commit — a failed render/send never rolls back the
  // audit trail; it lands as send_failed on the log rows
  let rendered: RenderedInvoiceEmail;
  try {
    rendered = await buildEmail({
      snapshot: prepared.snapshot,
      status: prepared.status,
      publicUrl: `${baseUrl}/i/${prepared.publicToken}`,
      organizationName: prepared.organizationName,
      watermark: prepared.watermark,
    });
  } catch {
    rendered = await plainInvoiceEmail({
      snapshot: prepared.snapshot,
      status: prepared.status,
      publicUrl: `${baseUrl}/i/${prepared.publicToken}`,
      organizationName: prepared.organizationName,
      watermark: prepared.watermark,
    });
  }
  for (let i = 0; i < prepared.recipients.length; i++) {
    let providerMessageId: string | null = null;
    let sendError: string | null = null;
    try {
      ({ providerMessageId } = await emailSender.send({
        to: prepared.recipients[i],
        ...rendered,
      }));
    } catch (error) {
      // keep the diagnostic on the log row (masked — never raw PII)
      sendError = maskPiiInText(
        error instanceof Error ? error.message : String(error),
      ).slice(0, 500);
    }
    await db
      .update(emailMessages)
      .set({
        status: providerMessageId ? "sent" : "send_failed",
        providerMessageId,
        error: sendError,
      })
      .where(
        and(
          eq(emailMessages.id, prepared.messageIds[i]),
          eq(emailMessages.organizationId, ctx.organizationId),
        ),
      );
  }
  return { recipients: prepared.recipients };
}

/** Send history for the workspace Emails tab. */
export async function listInvoiceEmails(
  db: Database,
  organizationId: string,
  invoiceId: string,
) {
  return db
    .select({
      id: emailMessages.id,
      recipient: emailMessages.recipient,
      subject: emailMessages.subject,
      status: emailMessages.status,
      createdAt: emailMessages.createdAt,
    })
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.organizationId, organizationId),
        eq(emailMessages.entityType, "invoice"),
        eq(emailMessages.entityId, invoiceId),
      ),
    )
    .orderBy(desc(emailMessages.createdAt));
}
