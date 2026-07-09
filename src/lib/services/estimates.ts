import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { Database, Transaction } from "@/lib/db/client";
import { withOrgTransaction } from "@/lib/db/tx";
import {
  auditLog,
  customerContacts,
  customers,
  emailMessages,
  estimateLineItems,
  estimates,
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
import { computeInvoiceTotals } from "@/lib/domain/invoice-math";
import {
  assertEstimateTransition,
  isAwaitingDecision,
  isEstimateConvertible,
  isEstimateDeletable,
  isEstimateEditable,
  marksAsViewed,
  type EstimateStatus,
} from "@/lib/domain/estimate-status";
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
import { requireEntitlement, type Plan } from "@/lib/authz/entitlements";
import { getFileStorage } from "@/lib/storage/r2";
import { customerActor } from "@/lib/audit/context";
import {
  getEmailSender,
  type EmailAttachment,
  type EmailSender,
} from "@/lib/email/port";
import { maskPiiInText } from "@/lib/domain/pii";
import { appBaseUrl } from "@/lib/config";
import {
  parseInvoiceSnapshot,
  type InvoiceSnapshot,
} from "@/lib/domain/invoice-snapshot";
import {
  DEFAULT_PDF_TEMPLATE,
  isPdfTemplateId,
  type PdfTemplateId,
} from "@/lib/domain/pdf-templates";
import { getMembership } from "./organizations";
import {
  convertEstimateSchema,
  createEstimateDraftSchema,
  deleteEstimateDraftSchema,
  estimateDecisionSchema,
  issueEstimateSchema,
  sendEstimateSchema,
  updateEstimateDraftSchema,
  type ConvertEstimateInput,
  type CreateEstimateDraftInput,
  type DeleteEstimateDraftInput,
  type EstimateDecisionInput,
  type IssueEstimateInput,
  type SendEstimateInput,
  type UpdateEstimateDraftInput,
} from "@/lib/validation/estimates";

/**
 * Estimate lifecycle (brief §105, slice 6). Same discipline as invoices:
 * drafts are working documents; issue assigns the EST number under FOR
 * UPDATE and freezes a snapshot; issued estimates are immutable. An
 * accepted estimate converts into a LINKED INVOICE DRAFT (the owner
 * reviews before the invoice itself is issued — conversion is not an
 * issue). Estimates move no money, so foreign-currency estimates carry no
 * FX rate; the rate is captured when the converted invoice issues (§5.6).
 */

async function getBillingContext(tx: Transaction, organizationId: string) {
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

async function lockEstimate(
  tx: Transaction,
  organizationId: string,
  id: string,
): Promise<typeof estimates.$inferSelect> {
  const [row] = await tx
    .select()
    .from(estimates)
    .where(
      and(
        eq(estimates.id, id),
        eq(estimates.organizationId, organizationId),
        isNull(estimates.deletedAt),
      ),
    )
    .for("update");
  if (!row) throw new NotFoundError("Estimate");
  return row;
}

type DraftLines = Array<{
  productId?: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discountBps: number;
  taxRateBps: number;
}>;

function lineInputs(lines: DraftLines, currency: string) {
  return lines.map((l) => ({
    quantity: l.quantity,
    unitPriceMinor: Money.parse(l.unitPrice, currency).amountMinor,
    discountBps: l.discountBps,
    taxRateBps: l.taxRateBps,
  }));
}

async function insertLines(
  tx: Transaction,
  organizationId: string,
  estimateId: string,
  currency: string,
  lines: DraftLines,
): Promise<void> {
  await tx.insert(estimateLineItems).values(
    lines.map((l, i) => ({
      id: newId(),
      organizationId,
      estimateId,
      productId: l.productId ?? null,
      description: l.description,
      quantity: l.quantity,
      unitPriceMinor: Money.parse(l.unitPrice, currency).amountMinor,
      discountBps: l.discountBps,
      taxRateBps: l.taxRateBps,
      lineTotalMinor: computeInvoiceTotals(lineInputs([l], currency), currency)
        .total.amountMinor,
      position: i,
    })),
  );
}

// ---------------------------------------------------------------------------
// draft lifecycle

export async function createEstimateDraft(
  db: Database,
  ctx: ActorContext,
  input: CreateEstimateDraftInput,
): Promise<{ estimateId: string }> {
  const data = createEstimateDraftSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("estimate.create");
  const estimateId = newId();

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "estimate.create");
    const org = await getBillingContext(tx, ctx.organizationId);
    if (data.currency !== org.baseCurrency) {
      requireEntitlement(org.plan, "multiCurrency");
    }
    await assertCustomerInOrg(tx, ctx.organizationId, data.customerId);

    const totals = computeInvoiceTotals(
      lineInputs(data.lines, data.currency),
      data.currency,
    );
    await tx.insert(estimates).values({
      id: estimateId,
      organizationId: ctx.organizationId,
      customerId: data.customerId,
      status: "draft",
      currency: data.currency,
      issueDate: data.issueDate,
      expiryDate: data.expiryDate,
      subtotalMinor: totals.subtotal.amountMinor,
      discountTotalMinor: totals.discountTotal.amountMinor,
      taxTotalMinor: totals.taxTotal.amountMinor,
      totalMinor: totals.total.amountMinor,
      notes: data.notes,
      terms: data.terms,
    });
    await insertLines(tx, ctx.organizationId, estimateId, data.currency, data.lines);
    await writeAudit(tx, ctx, {
      action: "estimate.created",
      entityType: "estimate",
      entityId: estimateId,
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
  return { estimateId };
}

export async function updateEstimateDraft(
  db: Database,
  ctx: ActorContext,
  input: UpdateEstimateDraftInput,
): Promise<void> {
  const data = updateEstimateDraftSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("estimate.update");

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "estimate.update");
    const before = await lockEstimate(tx, ctx.organizationId, data.id);
    if (!isEstimateEditable(before.status as EstimateStatus)) {
      throw new ImmutableDocumentError("Estimate");
    }
    if (before.version !== data.version) throw new ConflictError("Estimate");

    const org = await getBillingContext(tx, ctx.organizationId);
    if (data.currency !== org.baseCurrency) {
      requireEntitlement(org.plan, "multiCurrency");
    }
    await assertCustomerInOrg(tx, ctx.organizationId, data.customerId);

    const totals = computeInvoiceTotals(
      lineInputs(data.lines, data.currency),
      data.currency,
    );
    await tx
      .delete(estimateLineItems)
      .where(
        and(
          eq(estimateLineItems.estimateId, data.id),
          eq(estimateLineItems.organizationId, ctx.organizationId),
        ),
      );
    await insertLines(tx, ctx.organizationId, data.id, data.currency, data.lines);
    await tx
      .update(estimates)
      .set({
        customerId: data.customerId,
        currency: data.currency,
        issueDate: data.issueDate,
        expiryDate: data.expiryDate,
        subtotalMinor: totals.subtotal.amountMinor,
        discountTotalMinor: totals.discountTotal.amountMinor,
        taxTotalMinor: totals.taxTotal.amountMinor,
        totalMinor: totals.total.amountMinor,
        notes: data.notes,
        terms: data.terms,
        version: before.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(estimates.id, data.id));
    await writeAudit(tx, ctx, {
      action: "estimate.updated",
      entityType: "estimate",
      entityId: data.id,
      changes: {
        before: jsonSafe({ totalMinor: before.totalMinor }),
        after: jsonSafe({
          totalMinor: totals.total.amountMinor,
          lineCount: data.lines.length,
        }),
      },
    });
  });
}

export async function deleteEstimateDraft(
  db: Database,
  ctx: ActorContext,
  input: DeleteEstimateDraftInput,
): Promise<void> {
  const data = deleteEstimateDraftSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("estimate.update");

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "estimate.update");
    const before = await lockEstimate(tx, ctx.organizationId, data.id);
    if (!isEstimateDeletable(before.status as EstimateStatus)) {
      throw new ImmutableDocumentError("Estimate");
    }
    if (before.version !== data.version) throw new ConflictError("Estimate");

    const now = new Date();
    await tx
      .update(estimateLineItems)
      .set({ deletedAt: now })
      .where(
        and(
          eq(estimateLineItems.estimateId, data.id),
          eq(estimateLineItems.organizationId, ctx.organizationId),
        ),
      );
    await tx
      .update(estimates)
      .set({ deletedAt: now, version: before.version + 1 })
      .where(eq(estimates.id, data.id));
    await writeAudit(tx, ctx, {
      action: "estimate.deleted",
      entityType: "estimate",
      entityId: data.id,
      changes: { before: jsonSafe({ totalMinor: before.totalMinor }) },
    });
  });
}

// ---------------------------------------------------------------------------
// issue, decision, conversion

export async function issueEstimate(
  db: Database,
  ctx: ActorContext,
  input: IssueEstimateInput,
): Promise<{ displayNumber: string }> {
  const data = issueEstimateSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("estimate.send");
  if (data.expiryDate < data.issueDate) {
    throw new ValidationError("Expiry date cannot be before the issue date");
  }

  return withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "estimate.send");
    const estimate = await lockEstimate(tx, ctx.organizationId, data.id);
    assertEstimateTransition(estimate.status as EstimateStatus, "sent");
    if (estimate.version !== data.version) throw new ConflictError("Estimate");

    // defense in depth (slice-2 decision): the gate ran at draft time, and
    // runs again here so a downgraded org cannot issue a foreign draft
    const orgGate = await getBillingContext(tx, ctx.organizationId);
    if (estimate.currency !== orgGate.baseCurrency) {
      requireEntitlement(orgGate.plan, "multiCurrency");
    }

    const [settings] = await tx
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, ctx.organizationId))
      .for("update");
    if (!settings) throw new NotFoundError("Organization settings");
    const displayNumber = `${settings.estimatePrefix}-${String(
      settings.estimateNextNumber,
    ).padStart(6, "0")}`;
    await tx
      .update(organizationSettings)
      .set({
        estimateNextNumber: settings.estimateNextNumber + 1,
        updatedAt: new Date(),
      })
      .where(eq(organizationSettings.organizationId, ctx.organizationId));

    const lines = await tx
      .select()
      .from(estimateLineItems)
      .where(
        and(
          eq(estimateLineItems.estimateId, estimate.id),
          eq(estimateLineItems.organizationId, ctx.organizationId),
          isNull(estimateLineItems.deletedAt),
        ),
      )
      .orderBy(asc(estimateLineItems.position));
    if (lines.length === 0) {
      throw new ValidationError("An estimate needs at least one line item");
    }
    const totals = computeInvoiceTotals(
      lines.map((l) => ({
        quantity: l.quantity,
        unitPriceMinor: l.unitPriceMinor ?? 0n,
        discountBps: l.discountBps,
        taxRateBps: l.taxRateBps,
      })),
      estimate.currency,
    );

    const [customer] = await tx
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, estimate.customerId),
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
    const org = await getBillingContext(tx, ctx.organizationId);

    const snapshot = jsonSafe({
      docType: "estimate",
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
      currency: estimate.currency,
      baseCurrency: org.baseCurrency,
      issueDate: data.issueDate,
      expiryDate: data.expiryDate,
      displayNumber,
      notes: estimate.notes,
      terms: estimate.terms,
      pdfTemplate: branding?.pdfTemplate ?? "classic",
    });

    await tx
      .update(estimates)
      .set({
        status: "sent",
        displayNumber,
        issueDate: data.issueDate,
        expiryDate: data.expiryDate,
        subtotalMinor: totals.subtotal.amountMinor,
        discountTotalMinor: totals.discountTotal.amountMinor,
        taxTotalMinor: totals.taxTotal.amountMinor,
        totalMinor: totals.total.amountMinor,
        publicToken: randomBytes(24).toString("base64url"),
        snapshot,
        issuedAt: new Date(),
        version: estimate.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(estimates.id, estimate.id));
    await writeAudit(tx, ctx, {
      action: "estimate.issued",
      entityType: "estimate",
      entityId: estimate.id,
      changes: {
        after: jsonSafe({
          displayNumber,
          totalMinor: totals.total.amountMinor,
          issueDate: data.issueDate,
          expiryDate: data.expiryDate,
        }),
      },
    });
    return { displayNumber };
  });
}

/** Record the customer's answer (or expiry) — internal action, audited. */
export async function recordEstimateDecision(
  db: Database,
  ctx: ActorContext,
  input: EstimateDecisionInput,
): Promise<void> {
  const data = estimateDecisionSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("estimate.update");

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "estimate.update");
    const estimate = await lockEstimate(tx, ctx.organizationId, data.id);
    assertEstimateTransition(
      estimate.status as EstimateStatus,
      data.decision,
    );
    await tx
      .update(estimates)
      .set({ status: data.decision, updatedAt: new Date() })
      .where(eq(estimates.id, estimate.id));
    await writeAudit(tx, ctx, {
      action: `estimate.${data.decision}`,
      entityType: "estimate",
      entityId: estimate.id,
      changes: {
        before: { status: estimate.status },
        after: { status: data.decision },
      },
    });
  });
}

/**
 * Accepted estimate → LINKED INVOICE DRAFT. Lines are copied, the estimate
 * records convertedInvoiceId and becomes terminal, and both documents get
 * audit rows — one transaction, so a half-converted state cannot exist.
 * The invoice is a draft on purpose: its own issue flow (number, FX rate,
 * snapshot, cap) runs when the owner is ready.
 */
export async function convertEstimateToInvoice(
  db: Database,
  ctx: ActorContext,
  input: ConvertEstimateInput,
): Promise<{ invoiceId: string }> {
  const data = convertEstimateSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("estimate.convert");
  const invoiceId = newId();

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "estimate.convert");
    const estimate = await lockEstimate(tx, ctx.organizationId, data.id);
    if (!isEstimateConvertible(estimate.status as EstimateStatus)) {
      throw new ValidationError(
        "Only an accepted estimate can convert to an invoice",
      );
    }
    if (estimate.version !== data.version) throw new ConflictError("Estimate");

    const lines = await tx
      .select()
      .from(estimateLineItems)
      .where(
        and(
          eq(estimateLineItems.estimateId, estimate.id),
          eq(estimateLineItems.organizationId, ctx.organizationId),
          isNull(estimateLineItems.deletedAt),
        ),
      )
      .orderBy(asc(estimateLineItems.position));
    if (lines.length === 0) {
      throw new ValidationError("The estimate has no line items to convert");
    }

    await tx.insert(invoices).values({
      id: invoiceId,
      organizationId: ctx.organizationId,
      customerId: estimate.customerId,
      status: "draft",
      currency: estimate.currency,
      subtotalMinor: estimate.subtotalMinor,
      discountTotalMinor: estimate.discountTotalMinor,
      taxTotalMinor: estimate.taxTotalMinor,
      totalMinor: estimate.totalMinor,
      amountPaidMinor: 0n,
      notes: estimate.notes,
      terms: estimate.terms,
    });
    await tx.insert(invoiceLineItems).values(
      lines.map((l, i) => ({
        id: newId(),
        organizationId: ctx.organizationId,
        invoiceId,
        productId: l.productId,
        description: l.description,
        quantity: l.quantity,
        unitPriceMinor: l.unitPriceMinor,
        discountBps: l.discountBps,
        taxRateBps: l.taxRateBps,
        lineTotalMinor: l.lineTotalMinor,
        position: i,
      })),
    );
    await tx
      .update(estimates)
      .set({
        status: "converted",
        convertedInvoiceId: invoiceId,
        version: estimate.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(estimates.id, estimate.id));

    await writeAudit(tx, ctx, {
      action: "estimate.converted",
      entityType: "estimate",
      entityId: estimate.id,
      changes: {
        after: jsonSafe({
          invoiceId,
          displayNumber: estimate.displayNumber,
          totalMinor: estimate.totalMinor,
        }),
      },
    });
    await writeAudit(tx, ctx, {
      action: "invoice.created",
      entityType: "invoice",
      entityId: invoiceId,
      changes: {
        after: jsonSafe({
          fromEstimateId: estimate.id,
          fromEstimateNumber: estimate.displayNumber,
          customerId: estimate.customerId,
          currency: estimate.currency,
          totalMinor: estimate.totalMinor,
          lineCount: lines.length,
        }),
      },
    });
  });
  return { invoiceId };
}

// ---------------------------------------------------------------------------
// reads

export async function listEstimates(
  db: Database,
  organizationId: string,
  filters: { status?: EstimateStatus; q?: string } = {},
) {
  const conditions = [
    eq(estimates.organizationId, organizationId),
    isNull(estimates.deletedAt),
  ];
  if (filters.status) conditions.push(eq(estimates.status, filters.status));
  if (filters.q) {
    const pattern = `%${filters.q}%`;
    const search = or(
      ilike(estimates.displayNumber, pattern),
      ilike(customers.name, pattern),
    );
    if (search) conditions.push(search);
  }
  return db
    .select({
      id: estimates.id,
      displayNumber: estimates.displayNumber,
      status: estimates.status,
      currency: estimates.currency,
      issueDate: estimates.issueDate,
      expiryDate: estimates.expiryDate,
      totalMinor: estimates.totalMinor,
      customerId: estimates.customerId,
      customerName: customers.name,
      convertedInvoiceId: estimates.convertedInvoiceId,
      createdAt: estimates.createdAt,
    })
    .from(estimates)
    .innerJoin(
      customers,
      and(
        eq(customers.id, estimates.customerId),
        eq(customers.organizationId, organizationId),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(estimates.createdAt));
}

export async function getEstimate(
  db: Database,
  organizationId: string,
  estimateId: string,
) {
  const [estimate] = await db
    .select()
    .from(estimates)
    .where(
      and(
        eq(estimates.id, estimateId),
        eq(estimates.organizationId, organizationId),
        isNull(estimates.deletedAt),
      ),
    )
    .limit(1);
  if (!estimate) return null;
  const [customer] = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(eq(customers.id, estimate.customerId))
    .limit(1);
  const lines = await db
    .select()
    .from(estimateLineItems)
    .where(
      and(
        eq(estimateLineItems.estimateId, estimateId),
        eq(estimateLineItems.organizationId, organizationId),
        isNull(estimateLineItems.deletedAt),
      ),
    )
    .orderBy(asc(estimateLineItems.position));
  return { ...estimate, customer: customer ?? null, lines };
}

export async function getEstimateTimeline(
  db: Database,
  organizationId: string,
  estimateId: string,
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
        eq(auditLog.entityType, "estimate"),
        eq(auditLog.entityId, estimateId),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

/** Public lookup by unguessable token (read-only hosted view). */
export async function getEstimateByPublicToken(db: Database, token: string) {
  if (!token || token.length < 20) return null;
  const [estimate] = await db
    .select()
    .from(estimates)
    .where(and(eq(estimates.publicToken, token), isNull(estimates.deletedAt)))
    .limit(1);
  if (!estimate || estimate.status === "draft" || !estimate.snapshot) {
    return null;
  }
  const [sub] = await db
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, estimate.organizationId))
    .limit(1);
  return {
    snapshot: estimate.snapshot as Record<string, unknown>,
    status: estimate.status as EstimateStatus,
    watermark: ((sub?.plan ?? "free") as Plan) === "free",
  };
}

function logoUrlFor(key: string | null | undefined): string | null {
  if (!key) return null;
  try {
    return getFileStorage().publicUrl(key);
  } catch {
    return null;
  }
}

function templateOf(snapshot: InvoiceSnapshot): PdfTemplateId {
  return snapshot.pdfTemplate && isPdfTemplateId(snapshot.pdfTemplate)
    ? snapshot.pdfTemplate
    : DEFAULT_PDF_TEMPLATE;
}

/** Snapshot + render params for the estimate PDF (expiry maps to dueDate). */
export async function getEstimatePdfData(
  db: Database,
  organizationId: string,
  estimateId: string,
) {
  const [est] = await db
    .select()
    .from(estimates)
    .where(
      and(
        eq(estimates.id, estimateId),
        eq(estimates.organizationId, organizationId),
        isNull(estimates.deletedAt),
      ),
    )
    .limit(1);
  if (!est || !est.snapshot) return null;
  const raw = est.snapshot as Record<string, unknown>;
  const snapshot = parseInvoiceSnapshot({
    ...raw,
    dueDate: (raw as { expiryDate?: string }).expiryDate,
  });
  const [sub] = await db
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);
  return {
    snapshot,
    status: est.status,
    displayNumber: est.displayNumber!,
    watermark: ((sub?.plan ?? "free") as Plan) === "free",
    logoUrl: logoUrlFor(snapshot.branding?.logoKey),
    template: templateOf(snapshot),
  };
}

// ---------------------------------------------------------------------------
// public link: view tracking + client accept/decline

async function estimateByToken(db: Database, token: string) {
  if (!token || token.length < 20) return null;
  const [row] = await db
    .select({
      id: estimates.id,
      organizationId: estimates.organizationId,
      status: estimates.status,
      expiryDate: estimates.expiryDate,
      snapshot: estimates.snapshot,
    })
    .from(estimates)
    .where(and(eq(estimates.publicToken, token), isNull(estimates.deletedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Marks a freshly-sent quote as viewed when the customer opens the public
 * link (recorded as a CUSTOMER actor). Idempotent and re-checked under lock —
 * a decided quote is never un-decided, and repeated views are no-ops.
 */
export async function recordEstimateView(
  db: Database,
  token: string,
  meta?: { ip?: string; userAgent?: string },
): Promise<void> {
  const est = await estimateByToken(db, token);
  if (!est || !marksAsViewed(est.status as EstimateStatus)) return;
  const ctx = customerActor(est.organizationId, meta);
  await withOrgTransaction(db, est.organizationId, async (tx) => {
    const locked = await lockEstimate(tx, est.organizationId, est.id);
    if (!marksAsViewed(locked.status as EstimateStatus)) return;
    await tx
      .update(estimates)
      .set({ status: "viewed", updatedAt: new Date() })
      .where(eq(estimates.id, est.id));
    await writeAudit(tx, ctx, {
      action: "estimate.viewed",
      entityType: "estimate",
      entityId: est.id,
      changes: { before: { status: locked.status }, after: { status: "viewed" } },
    });
  });
}

/**
 * The customer's own accept/decline from the public link. Allowed only while
 * the quote awaits a decision (sent/viewed); accept is refused past expiry.
 * Recorded as a CUSTOMER actor with a "via public link" reason.
 */
export async function recordPublicEstimateDecision(
  db: Database,
  token: string,
  decision: "accepted" | "declined",
  meta?: { ip?: string; userAgent?: string },
): Promise<{ status: EstimateStatus }> {
  const est = await estimateByToken(db, token);
  if (!est || est.status === "draft" || !est.snapshot) {
    throw new NotFoundError("Estimate");
  }
  const ctx = customerActor(est.organizationId, meta);
  return withOrgTransaction(db, est.organizationId, async (tx) => {
    const locked = await lockEstimate(tx, est.organizationId, est.id);
    if (!isAwaitingDecision(locked.status as EstimateStatus)) {
      throw new ValidationError("This quote has already been responded to");
    }
    if (
      decision === "accepted" &&
      locked.expiryDate &&
      locked.expiryDate < new Date().toISOString().slice(0, 10)
    ) {
      throw new ValidationError(
        "This quote has expired — please ask the sender for a new one",
      );
    }
    assertEstimateTransition(locked.status as EstimateStatus, decision);
    await tx
      .update(estimates)
      .set({ status: decision, updatedAt: new Date() })
      .where(eq(estimates.id, locked.id));
    await writeAudit(tx, ctx, {
      action: `estimate.${decision}`,
      entityType: "estimate",
      entityId: locked.id,
      changes: {
        before: { status: locked.status },
        after: { status: decision },
      },
      reason: "via public link",
    });
    return { status: decision };
  });
}

// ---------------------------------------------------------------------------
// email send (mirrors sendInvoice)

/** Any issued estimate may be emailed; drafts have no number/token/snapshot. */
const SENDABLE_ESTIMATE: readonly EstimateStatus[] = [
  "sent",
  "viewed",
  "accepted",
  "declined",
  "expired",
];
const ESTIMATE_SEND_HOURLY_CAP = 30;

export interface RenderedEstimateEmail {
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}

export type EstimateEmailBuilder = (params: {
  snapshot: InvoiceSnapshot;
  publicUrl: string;
  organizationName: string;
  watermark: boolean;
}) => Promise<RenderedEstimateEmail>;

const plainEstimateEmail: EstimateEmailBuilder = async ({
  snapshot,
  publicUrl,
  organizationName,
}) => ({
  subject: `Quote ${snapshot.displayNumber} from ${organizationName}`,
  text:
    `${organizationName} sent you quote ${snapshot.displayNumber} for ` +
    `${Money.fromMinor(BigInt(snapshot.totals.totalMinor), snapshot.currency).toString()}.` +
    `\n\nView and respond: ${publicUrl}`,
});

export interface SendEstimateDeps {
  emailSender?: EmailSender;
  baseUrl?: string;
  buildEmail?: EstimateEmailBuilder;
}

export async function sendEstimate(
  db: Database,
  ctx: ActorContext,
  input: SendEstimateInput,
  deps: SendEstimateDeps = {},
): Promise<{ recipients: string[] }> {
  const data = sendEstimateSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("estimate.send");
  const emailSender = deps.emailSender ?? getEmailSender();
  const baseUrl = deps.baseUrl ?? appBaseUrl();
  const buildEmail = deps.buildEmail ?? plainEstimateEmail;

  const prepared = await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "estimate.send");

    const [sender] = await tx
      .select({ emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, ctx.actorId!));
    if (!sender?.emailVerified) {
      throw new ValidationError(
        "Verify your email address before sending quotes",
      );
    }

    const estimate = await lockEstimate(tx, ctx.organizationId, data.id);
    if (!SENDABLE_ESTIMATE.includes(estimate.status as EstimateStatus)) {
      throw new ValidationError("Issue the estimate before sending it");
    }
    const rawSnap = estimate.snapshot as Record<string, unknown> & {
      expiryDate?: string;
    };
    // estimates store expiryDate; the shared render path reads dueDate
    const snapshot = parseInvoiceSnapshot({
      ...rawSnap,
      dueDate: rawSnap.expiryDate,
    });

    const contacts = await tx
      .select({ id: customerContacts.id, email: customerContacts.email })
      .from(customerContacts)
      .where(
        and(
          eq(customerContacts.organizationId, ctx.organizationId),
          eq(customerContacts.customerId, estimate.customerId),
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

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [recent] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(emailMessages)
      .where(
        and(
          eq(emailMessages.organizationId, ctx.organizationId),
          eq(emailMessages.type, "estimate_send"),
          gte(emailMessages.createdAt, hourAgo),
        ),
      );
    if ((recent?.count ?? 0) + recipients.length > ESTIMATE_SEND_HOURLY_CAP) {
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
        type: "estimate_send",
        recipient,
        subject: `Quote ${snapshot.displayNumber}`,
        entityType: "estimate",
        entityId: estimate.id,
        status: "queued",
      })),
    );
    await writeAudit(tx, ctx, {
      action: "estimate.sent_email",
      entityType: "estimate",
      entityId: estimate.id,
      changes: { after: { recipients, displayNumber: snapshot.displayNumber } },
    });

    return {
      snapshot,
      publicToken: estimate.publicToken!,
      recipients,
      messageIds,
      organizationName: org?.name ?? "Your vendor",
      watermark: ((sub?.plan ?? "free") as Plan) === "free",
    };
  });

  const buildArgs = {
    snapshot: prepared.snapshot,
    publicUrl: `${baseUrl}/e/${prepared.publicToken}`,
    organizationName: prepared.organizationName,
    watermark: prepared.watermark,
  };
  let rendered: RenderedEstimateEmail;
  try {
    rendered = await buildEmail(buildArgs);
  } catch {
    rendered = await plainEstimateEmail(buildArgs);
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

/** Send history for the estimate workspace Emails tab. */
export async function listEstimateEmails(
  db: Database,
  organizationId: string,
  estimateId: string,
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
        eq(emailMessages.entityType, "estimate"),
        eq(emailMessages.entityId, estimateId),
      ),
    )
    .orderBy(desc(emailMessages.createdAt));
}
