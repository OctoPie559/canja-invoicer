import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Database, Transaction } from "@/lib/db/client";
import { withOrgTransaction } from "@/lib/db/tx";
import {
  auditLog,
  creditNoteLineItems,
  creditNotes,
  customers,
  invoices,
  organizationBranding,
  organizationSettings,
  user,
} from "@/lib/db/schema";
import { newId } from "@/lib/domain/ids";
import { Money, sumMoney } from "@/lib/domain/money";
import { computeInvoiceTotals } from "@/lib/domain/invoice-math";
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
import { getMembership } from "./organizations";
import { subscriptions } from "@/lib/db/schema";
import type { Plan } from "@/lib/authz/entitlements";
import { getFileStorage } from "@/lib/storage/r2";
import {
  parseInvoiceSnapshot,
} from "@/lib/domain/invoice-snapshot";
import {
  DEFAULT_PDF_TEMPLATE,
  isPdfTemplateId,
} from "@/lib/domain/pdf-templates";
import {
  createCreditNoteSchema,
  deleteCreditNoteSchema,
  issueCreditNoteSchema,
  updateCreditNoteSchema,
  voidCreditNoteSchema,
  type CreateCreditNoteInput,
  type DeleteCreditNoteInput,
  type IssueCreditNoteInput,
  type UpdateCreditNoteInput,
  type VoidCreditNoteInput,
} from "@/lib/validation/credit-notes";

/**
 * Credit notes (brief §106): corrections and refunds against ISSUED
 * invoices — never edits to them. A credit note follows the same document
 * discipline: drafts editable, issue assigns the CN number + snapshot and
 * locks it, void annuls with a reason. Its currency is the invoice's, and
 * at issue it inherits the invoice's FX snapshot so reports convert both
 * documents through the same rate.
 *
 * The exit-criterion rule lives here: effective balance =
 * invoice total − cash received − ISSUED credits (drafts and voids don't
 * count), and total issued credit can never exceed the invoice total.
 */

export type CreditNoteStatus = "draft" | "issued" | "void";

function assertCnTransition(from: CreditNoteStatus, to: CreditNoteStatus): void {
  const legal =
    (from === "draft" && to === "issued") || (from === "issued" && to === "void");
  if (!legal) {
    throw new ValidationError(`A credit note cannot go from ${from} to ${to}`);
  }
}

type CnLines = Array<{
  description: string;
  quantity: string;
  unitPrice: string;
  taxRateBps: number;
}>;

function cnTotals(lines: CnLines, currency: string) {
  return computeInvoiceTotals(
    lines.map((l) => ({
      quantity: l.quantity,
      unitPriceMinor: Money.parse(l.unitPrice, currency).amountMinor,
      discountBps: 0,
      taxRateBps: l.taxRateBps,
    })),
    currency,
  );
}

async function lockCreditNote(
  tx: Transaction,
  organizationId: string,
  id: string,
): Promise<typeof creditNotes.$inferSelect> {
  const [row] = await tx
    .select()
    .from(creditNotes)
    .where(
      and(
        eq(creditNotes.id, id),
        eq(creditNotes.organizationId, organizationId),
        isNull(creditNotes.deletedAt),
      ),
    )
    .for("update");
  if (!row) throw new NotFoundError("Credit note");
  return row;
}

/** Sum of ISSUED credits against an invoice, in the invoice's currency. */
export async function issuedCreditsForInvoice(
  db: Database | Transaction,
  organizationId: string,
  invoiceId: string,
  currency: string,
): Promise<Money> {
  const rows = await db
    .select({ totalMinor: creditNotes.totalMinor })
    .from(creditNotes)
    .where(
      and(
        eq(creditNotes.organizationId, organizationId),
        eq(creditNotes.invoiceId, invoiceId),
        eq(creditNotes.status, "issued"),
        isNull(creditNotes.deletedAt),
      ),
    );
  return sumMoney(
    rows.map((r) => Money.fromMinor(r.totalMinor ?? 0n, currency)),
    currency,
  );
}

async function assertWithinCreditable(
  tx: Transaction,
  organizationId: string,
  invoice: { id: string; currency: string; totalMinor: bigint | null },
  proposedMinor: bigint,
): Promise<void> {
  const issued = await issuedCreditsForInvoice(
    tx,
    organizationId,
    invoice.id,
    invoice.currency,
  );
  const headroom = (invoice.totalMinor ?? 0n) - issued.amountMinor;
  if (proposedMinor > headroom) {
    throw new ValidationError(
      `Credit exceeds the creditable balance (${Money.fromMinor(
        headroom < 0n ? 0n : headroom,
        invoice.currency,
      ).toString()} remaining on this invoice)`,
    );
  }
}

// ---------------------------------------------------------------------------
// draft lifecycle

export async function createCreditNote(
  db: Database,
  ctx: ActorContext,
  input: CreateCreditNoteInput,
): Promise<{ creditNoteId: string }> {
  const data = createCreditNoteSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("credit_note.create");
  const creditNoteId = newId();

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "credit_note.create");

    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.id, data.invoiceId),
          eq(invoices.organizationId, ctx.organizationId),
          isNull(invoices.deletedAt),
        ),
      )
      .for("update");
    if (!invoice) throw new NotFoundError("Invoice");
    if (invoice.status === "draft" || invoice.status === "void") {
      throw new ValidationError(
        invoice.status === "draft"
          ? "Credit notes correct ISSUED invoices — issue it first"
          : "A void invoice cannot be credited",
      );
    }

    const totals = cnTotals(data.lines, invoice.currency);
    await assertWithinCreditable(
      tx,
      ctx.organizationId,
      invoice,
      totals.total.amountMinor,
    );

    await tx.insert(creditNotes).values({
      id: creditNoteId,
      organizationId: ctx.organizationId,
      invoiceId: invoice.id,
      status: "draft",
      currency: invoice.currency,
      subtotalMinor: totals.subtotal.amountMinor,
      taxTotalMinor: totals.taxTotal.amountMinor,
      totalMinor: totals.total.amountMinor,
      reason: data.reason,
    });
    await tx.insert(creditNoteLineItems).values(
      data.lines.map((l, i) => ({
        id: newId(),
        organizationId: ctx.organizationId,
        creditNoteId,
        description: l.description,
        quantity: l.quantity,
        unitPriceMinor: Money.parse(l.unitPrice, invoice.currency).amountMinor,
        taxRateBps: l.taxRateBps,
        lineTotalMinor: cnTotals([l], invoice.currency).total.amountMinor,
        position: i,
      })),
    );
    await writeAudit(tx, ctx, {
      action: "credit_note.created",
      entityType: "credit_note",
      entityId: creditNoteId,
      changes: {
        after: jsonSafe({
          invoiceId: invoice.id,
          invoiceNumber: invoice.displayNumber,
          totalMinor: totals.total.amountMinor,
          reason: data.reason,
        }),
      },
    });
  });
  return { creditNoteId };
}

export async function updateCreditNote(
  db: Database,
  ctx: ActorContext,
  input: UpdateCreditNoteInput,
): Promise<void> {
  const data = updateCreditNoteSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("credit_note.create");

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "credit_note.create");
    const before = await lockCreditNote(tx, ctx.organizationId, data.id);
    if (before.status !== "draft") throw new ImmutableDocumentError("Credit note");
    if (before.version !== data.version) throw new ConflictError("Credit note");

    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.id, before.invoiceId),
          eq(invoices.organizationId, ctx.organizationId),
        ),
      );
    if (!invoice) throw new NotFoundError("Invoice");

    const totals = cnTotals(data.lines, invoice.currency);
    await assertWithinCreditable(
      tx,
      ctx.organizationId,
      invoice,
      totals.total.amountMinor,
    );

    await tx
      .delete(creditNoteLineItems)
      .where(
        and(
          eq(creditNoteLineItems.creditNoteId, data.id),
          eq(creditNoteLineItems.organizationId, ctx.organizationId),
        ),
      );
    await tx.insert(creditNoteLineItems).values(
      data.lines.map((l, i) => ({
        id: newId(),
        organizationId: ctx.organizationId,
        creditNoteId: data.id,
        description: l.description,
        quantity: l.quantity,
        unitPriceMinor: Money.parse(l.unitPrice, invoice.currency).amountMinor,
        taxRateBps: l.taxRateBps,
        lineTotalMinor: cnTotals([l], invoice.currency).total.amountMinor,
        position: i,
      })),
    );
    await tx
      .update(creditNotes)
      .set({
        subtotalMinor: totals.subtotal.amountMinor,
        taxTotalMinor: totals.taxTotal.amountMinor,
        totalMinor: totals.total.amountMinor,
        reason: data.reason,
        version: before.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(creditNotes.id, data.id));
    await writeAudit(tx, ctx, {
      action: "credit_note.updated",
      entityType: "credit_note",
      entityId: data.id,
      changes: {
        before: jsonSafe({ totalMinor: before.totalMinor }),
        after: jsonSafe({ totalMinor: totals.total.amountMinor }),
      },
    });
  });
}

export async function deleteCreditNote(
  db: Database,
  ctx: ActorContext,
  input: DeleteCreditNoteInput,
): Promise<void> {
  const data = deleteCreditNoteSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("credit_note.create");

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "credit_note.create");
    const before = await lockCreditNote(tx, ctx.organizationId, data.id);
    if (before.status !== "draft") throw new ImmutableDocumentError("Credit note");
    if (before.version !== data.version) throw new ConflictError("Credit note");

    const now = new Date();
    await tx
      .update(creditNoteLineItems)
      .set({ deletedAt: now })
      .where(
        and(
          eq(creditNoteLineItems.creditNoteId, data.id),
          eq(creditNoteLineItems.organizationId, ctx.organizationId),
        ),
      );
    await tx
      .update(creditNotes)
      .set({ deletedAt: now, version: before.version + 1 })
      .where(eq(creditNotes.id, data.id));
    await writeAudit(tx, ctx, {
      action: "credit_note.deleted",
      entityType: "credit_note",
      entityId: data.id,
      changes: { before: jsonSafe({ totalMinor: before.totalMinor }) },
    });
  });
}

// ---------------------------------------------------------------------------
// issue / void

export async function issueCreditNote(
  db: Database,
  ctx: ActorContext,
  input: IssueCreditNoteInput,
): Promise<{ displayNumber: string }> {
  const data = issueCreditNoteSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("credit_note.issue");

  return withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "credit_note.issue");
    const cn = await lockCreditNote(tx, ctx.organizationId, data.id);
    assertCnTransition(cn.status as CreditNoteStatus, "issued");
    if (cn.version !== data.version) throw new ConflictError("Credit note");

    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.id, cn.invoiceId),
          eq(invoices.organizationId, ctx.organizationId),
        ),
      )
      .for("update");
    if (!invoice) throw new NotFoundError("Invoice");
    // re-check under lock: other credits may have issued since drafting
    await assertWithinCreditable(
      tx,
      ctx.organizationId,
      invoice,
      cn.totalMinor ?? 0n,
    );

    const [settings] = await tx
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, ctx.organizationId))
      .for("update");
    if (!settings) throw new NotFoundError("Organization settings");
    const displayNumber = `${settings.creditNotePrefix}-${String(
      settings.creditNoteNextNumber,
    ).padStart(6, "0")}`;
    await tx
      .update(organizationSettings)
      .set({
        creditNoteNextNumber: settings.creditNoteNextNumber + 1,
        updatedAt: new Date(),
      })
      .where(eq(organizationSettings.organizationId, ctx.organizationId));

    const lines = await tx
      .select()
      .from(creditNoteLineItems)
      .where(
        and(
          eq(creditNoteLineItems.creditNoteId, cn.id),
          eq(creditNoteLineItems.organizationId, ctx.organizationId),
          isNull(creditNoteLineItems.deletedAt),
        ),
      )
      .orderBy(asc(creditNoteLineItems.position));
    const [customer] = await tx
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, invoice.customerId),
          eq(customers.organizationId, ctx.organizationId),
        ),
      );
    const [branding] = await tx
      .select()
      .from(organizationBranding)
      .where(eq(organizationBranding.organizationId, ctx.organizationId));

    const snapshot = jsonSafe({
      docType: "credit_note",
      invoice: {
        id: invoice.id,
        displayNumber: invoice.displayNumber,
        issueDate: invoice.issueDate,
      },
      customer: customer
        ? {
            name: customer.name,
            addressLine1: customer.addressLine1,
            addressLine2: customer.addressLine2,
            city: customer.city,
            country: customer.country,
          }
        : null,
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
        taxRateBps: l.taxRateBps,
        lineTotalMinor: l.lineTotalMinor,
        position: l.position,
      })),
      totals: {
        subtotalMinor: cn.subtotalMinor,
        taxTotalMinor: cn.taxTotalMinor,
        totalMinor: cn.totalMinor,
      },
      currency: cn.currency,
      // credits convert through the SAME rate as their invoice (§5.6)
      fxRateToBase: invoice.fxRateToBase,
      issueDate: data.issueDate,
      displayNumber,
      reason: cn.reason,
      pdfTemplate: branding?.pdfTemplate ?? "classic",
    });

    await tx
      .update(creditNotes)
      .set({
        status: "issued",
        displayNumber,
        issueDate: data.issueDate,
        fxRateToBase: invoice.fxRateToBase,
        snapshot,
        issuedAt: new Date(),
        version: cn.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(creditNotes.id, cn.id));

    await writeAudit(tx, ctx, {
      action: "credit_note.issued",
      entityType: "credit_note",
      entityId: cn.id,
      changes: {
        after: jsonSafe({
          displayNumber,
          invoiceNumber: invoice.displayNumber,
          totalMinor: cn.totalMinor,
        }),
      },
    });
    // the invoice's own timeline shows it was credited
    await writeAudit(tx, ctx, {
      action: "invoice.credited",
      entityType: "invoice",
      entityId: invoice.id,
      changes: {
        after: jsonSafe({
          creditNoteId: cn.id,
          creditNoteNumber: displayNumber,
          totalMinor: cn.totalMinor,
        }),
      },
    });
    return { displayNumber };
  });
}

export async function voidCreditNote(
  db: Database,
  ctx: ActorContext,
  input: VoidCreditNoteInput,
): Promise<void> {
  const data = voidCreditNoteSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("credit_note.issue");

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "credit_note.issue");
    const cn = await lockCreditNote(tx, ctx.organizationId, data.id);
    assertCnTransition(cn.status as CreditNoteStatus, "void");

    await tx
      .update(creditNotes)
      .set({ status: "void", updatedAt: new Date() })
      .where(eq(creditNotes.id, cn.id));
    await writeAudit(tx, ctx, {
      action: "credit_note.voided",
      entityType: "credit_note",
      entityId: cn.id,
      changes: { before: { status: cn.status }, after: { status: "void" } },
      reason: data.reason,
    });
    await writeAudit(tx, ctx, {
      action: "invoice.credit_voided",
      entityType: "invoice",
      entityId: cn.invoiceId,
      changes: {
        after: jsonSafe({
          creditNoteId: cn.id,
          creditNoteNumber: cn.displayNumber,
          totalMinor: cn.totalMinor,
        }),
      },
      reason: data.reason,
    });
  });
}

// ---------------------------------------------------------------------------
// reads

export async function listCreditNotes(
  db: Database,
  organizationId: string,
  filters: { invoiceId?: string; status?: CreditNoteStatus } = {},
) {
  const conditions = [
    eq(creditNotes.organizationId, organizationId),
    isNull(creditNotes.deletedAt),
  ];
  if (filters.invoiceId) {
    conditions.push(eq(creditNotes.invoiceId, filters.invoiceId));
  }
  if (filters.status) conditions.push(eq(creditNotes.status, filters.status));
  return db
    .select({
      id: creditNotes.id,
      displayNumber: creditNotes.displayNumber,
      status: creditNotes.status,
      currency: creditNotes.currency,
      issueDate: creditNotes.issueDate,
      totalMinor: creditNotes.totalMinor,
      reason: creditNotes.reason,
      invoiceId: creditNotes.invoiceId,
      invoiceNumber: invoices.displayNumber,
      customerName: customers.name,
      createdAt: creditNotes.createdAt,
    })
    .from(creditNotes)
    .innerJoin(
      invoices,
      and(
        eq(invoices.id, creditNotes.invoiceId),
        eq(invoices.organizationId, organizationId),
      ),
    )
    .innerJoin(
      customers,
      and(
        eq(customers.id, invoices.customerId),
        eq(customers.organizationId, organizationId),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(creditNotes.createdAt));
}

export async function getCreditNote(
  db: Database,
  organizationId: string,
  creditNoteId: string,
) {
  const [cn] = await db
    .select()
    .from(creditNotes)
    .where(
      and(
        eq(creditNotes.id, creditNoteId),
        eq(creditNotes.organizationId, organizationId),
        isNull(creditNotes.deletedAt),
      ),
    )
    .limit(1);
  if (!cn) return null;
  const [invoice] = await db
    .select({
      id: invoices.id,
      displayNumber: invoices.displayNumber,
      customerId: invoices.customerId,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.id, cn.invoiceId),
        eq(invoices.organizationId, organizationId),
      ),
    )
    .limit(1);
  const lines = await db
    .select()
    .from(creditNoteLineItems)
    .where(
      and(
        eq(creditNoteLineItems.creditNoteId, creditNoteId),
        eq(creditNoteLineItems.organizationId, organizationId),
        isNull(creditNoteLineItems.deletedAt),
      ),
    )
    .orderBy(asc(creditNoteLineItems.position));
  return { ...cn, invoice: invoice ?? null, lines };
}

export async function getCreditNoteTimeline(
  db: Database,
  organizationId: string,
  creditNoteId: string,
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
        eq(auditLog.entityType, "credit_note"),
        eq(auditLog.entityId, creditNoteId),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

/** Issued credit totals per invoice — the reporting layer's input for
 * effective balances (invoiceId → credited minor units, invoice currency). */
export async function issuedCreditsByInvoice(
  db: Database,
  organizationId: string,
  invoiceIds?: string[],
): Promise<Map<string, bigint>> {
  const conditions = [
    eq(creditNotes.organizationId, organizationId),
    eq(creditNotes.status, "issued"),
    isNull(creditNotes.deletedAt),
  ];
  if (invoiceIds && invoiceIds.length > 0) {
    conditions.push(inArray(creditNotes.invoiceId, invoiceIds));
  } else if (invoiceIds) {
    return new Map();
  }
  const rows = await db
    .select({
      invoiceId: creditNotes.invoiceId,
      totalMinor: creditNotes.totalMinor,
    })
    .from(creditNotes)
    .where(and(...conditions));
  const map = new Map<string, bigint>();
  for (const row of rows) {
    map.set(row.invoiceId, (map.get(row.invoiceId) ?? 0n) + (row.totalMinor ?? 0n));
  }
  return map;
}

/** Snapshot + render params for the credit-note PDF. */
export async function getCreditNotePdfData(
  db: Database,
  organizationId: string,
  creditNoteId: string,
) {
  const [cn] = await db
    .select()
    .from(creditNotes)
    .where(
      and(
        eq(creditNotes.id, creditNoteId),
        eq(creditNotes.organizationId, organizationId),
        isNull(creditNotes.deletedAt),
      ),
    )
    .limit(1);
  if (!cn || !cn.snapshot) return null;
  const raw = cn.snapshot as Record<string, unknown> & {
    invoice?: { displayNumber?: string };
    pdfTemplate?: string;
    branding?: { logoKey?: string | null };
  };
  const snapshot = parseInvoiceSnapshot(raw);
  const [sub] = await db
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);
  let logoUrl: string | null = null;
  if (raw.branding?.logoKey) {
    try {
      logoUrl = getFileStorage().publicUrl(raw.branding.logoKey);
    } catch {
      logoUrl = null;
    }
  }
  return {
    snapshot,
    status: cn.status,
    displayNumber: cn.displayNumber!,
    reference: raw.invoice?.displayNumber
      ? `Credits ${raw.invoice.displayNumber}`
      : null,
    watermark: ((sub?.plan ?? "free") as Plan) === "free",
    logoUrl,
    template:
      raw.pdfTemplate && isPdfTemplateId(raw.pdfTemplate)
        ? raw.pdfTemplate
        : DEFAULT_PDF_TEMPLATE,
  };
}
