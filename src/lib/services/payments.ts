import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import type { Database, Transaction } from "@/lib/db/client";
import { withOrgTransaction } from "@/lib/db/tx";
import {
  customers,
  invoices,
  payments,
  user,
} from "@/lib/db/schema";
import { newId } from "@/lib/domain/ids";
import { Money } from "@/lib/domain/money";
import {
  computeSettlement,
  statusAfterPayment,
} from "@/lib/domain/payment-settlement";
import {
  assertTransition,
  isOutstanding,
  type InvoiceStatus,
} from "@/lib/domain/invoice-status";
import {
  NotFoundError,
  PermissionError,
  ValidationError,
} from "@/lib/domain/errors";
import { writeAudit } from "@/lib/audit/write";
import { jsonSafe } from "@/lib/audit/diff";
import type { ActorContext } from "@/lib/audit/context";
import { authorize } from "@/lib/authz/permissions";
import { getMembership } from "./organizations";
import {
  recordPaymentSchema,
  type RecordPaymentInput,
} from "@/lib/validation/payments";

/**
 * Manual payment recording (brief §5.4 launch scope) and the overdue cron.
 * A payment is append-only: recording mistakes are corrected by voiding
 * the mistaken entry via credit note flows in slice 6, never by editing —
 * money history follows the same immutability discipline as documents.
 */

type PaymentMethodName = "mpesa" | "bank" | "cash" | "card" | "other";

interface ApplyPaymentParams {
  invoiceId: string;
  /** as received, minor units */
  amountMinor: bigint;
  currency: string;
  /** payment currency → invoice currency; required iff they differ */
  fxRateUsed?: string | null;
  method: PaymentMethodName;
  source: "manual" | "gateway";
  provider?: string | null;
  /** globally-unique idempotency key for gateway callbacks; null for manual */
  providerTransactionId?: string | null;
  reference?: string | null;
  paidAt: Date;
  recordedBy?: string | null;
  notes?: string | null;
}

/**
 * The single settlement path both manual recording and gateway callbacks run
 * through (ARCHITECTURE.md §6: "record the payment through the same service
 * path as manual payments — same audit, same status recomputation"). Runs in
 * the caller's transaction: locks the invoice, computes settlement, inserts
 * the payment, recomputes status, and writes both audit rows. The caller owns
 * idempotency (dedup before calling); this asserts state and settles.
 */
export async function applyInvoicePayment(
  tx: Transaction,
  ctx: ActorContext,
  params: ApplyPaymentParams,
): Promise<{ paymentId: string; invoiceStatus: InvoiceStatus }> {
  const paymentId = newId();

  const [invoice] = await tx
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.id, params.invoiceId),
        eq(invoices.organizationId, ctx.organizationId),
        isNull(invoices.deletedAt),
      ),
    )
    .for("update");
  if (!invoice) throw new NotFoundError("Invoice");
  if (!isOutstanding(invoice.status as InvoiceStatus)) {
    throw new ValidationError(
      invoice.status === "draft"
        ? "Issue the invoice before recording payments"
        : `A ${invoice.status} invoice cannot take payments`,
    );
  }

  const received = Money.fromMinor(params.amountMinor, params.currency);
  const total = invoice.totalMinor ?? 0n;
  const paidBefore = invoice.amountPaidMinor ?? 0n;
  const settlement = computeSettlement({
    amountMinor: received.amountMinor,
    currency: params.currency,
    invoiceCurrency: invoice.currency,
    fxRateUsed: params.fxRateUsed ?? null,
    balanceDueMinor: total - paidBefore,
  });

  // cap the invoice-level tally at the total: the balance stays honest
  // and any over-payment lives on the payment row's settlementDelta
  const paidAfter = (() => {
    const raw = paidBefore + settlement.amountInInvoiceCurrency.amountMinor;
    return raw > total ? total : raw;
  })();
  const nextStatus = statusAfterPayment(paidAfter, total);
  // a third installment keeps a partial invoice partial — the identity
  // "transition" is legal for payments; assertTransition covers real moves
  if (invoice.status !== nextStatus) {
    assertTransition(invoice.status as InvoiceStatus, nextStatus);
  }

  await tx.insert(payments).values({
    id: paymentId,
    organizationId: ctx.organizationId,
    invoiceId: invoice.id,
    amountMinor: received.amountMinor,
    currency: received.currency,
    fxRateUsed: params.fxRateUsed ?? null,
    amountInInvoiceCurrencyMinor: settlement.amountInInvoiceCurrency.amountMinor,
    settlementDeltaMinor: settlement.settlementDelta.amountMinor,
    method: params.method,
    source: params.source,
    provider: params.provider ?? null,
    providerTransactionId: params.providerTransactionId ?? null,
    reference: params.reference ?? null,
    paidAt: params.paidAt,
    recordedBy: params.recordedBy ?? null,
    notes: params.notes ?? null,
  });
  await tx
    .update(invoices)
    .set({
      amountPaidMinor: paidAfter,
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoice.id));
  await writeAudit(tx, ctx, {
    action: "payment.recorded",
    entityType: "payment",
    entityId: paymentId,
    changes: {
      after: jsonSafe({
        invoiceId: invoice.id,
        displayNumber: invoice.displayNumber,
        amountMinor: received.amountMinor,
        currency: received.currency,
        amountInInvoiceCurrencyMinor:
          settlement.amountInInvoiceCurrency.amountMinor,
        settlementDeltaMinor: settlement.settlementDelta.amountMinor,
        method: params.method,
        source: params.source,
        invoiceStatus: nextStatus,
      }),
    },
  });
  // the invoice's own timeline shows the status change too
  await writeAudit(tx, ctx, {
    action: nextStatus === "paid" ? "invoice.paid" : "invoice.partially_paid",
    entityType: "invoice",
    entityId: invoice.id,
    changes: {
      before: { status: invoice.status, amountPaidMinor: String(paidBefore) },
      after: { status: nextStatus, amountPaidMinor: String(paidAfter) },
    },
  });
  return { paymentId, invoiceStatus: nextStatus };
}

export async function recordPayment(
  db: Database,
  ctx: ActorContext,
  input: RecordPaymentInput,
): Promise<{ paymentId: string; invoiceStatus: InvoiceStatus }> {
  const data = recordPaymentSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("payment.record");

  return withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "payment.record");
    return applyInvoicePayment(tx, ctx, {
      invoiceId: data.invoiceId,
      amountMinor: Money.parse(data.amount, data.currency).amountMinor,
      currency: data.currency,
      fxRateUsed: data.fxRateUsed ?? null,
      method: data.method,
      source: "manual",
      reference: data.reference ?? null,
      paidAt: new Date(`${data.paidAt}T00:00:00Z`),
      recordedBy: ctx.actorId,
      notes: data.notes ?? null,
    });
  });
}

/** Payments for one invoice (workspace Payments tab). */
export async function listInvoicePayments(
  db: Database,
  organizationId: string,
  invoiceId: string,
) {
  return db
    .select({
      id: payments.id,
      amountMinor: payments.amountMinor,
      currency: payments.currency,
      fxRateUsed: payments.fxRateUsed,
      amountInInvoiceCurrencyMinor: payments.amountInInvoiceCurrencyMinor,
      settlementDeltaMinor: payments.settlementDeltaMinor,
      method: payments.method,
      paidAt: payments.paidAt,
      notes: payments.notes,
      recordedByName: user.name,
    })
    .from(payments)
    .leftJoin(user, eq(user.id, payments.recordedBy))
    .where(
      and(
        eq(payments.organizationId, organizationId),
        eq(payments.invoiceId, invoiceId),
        isNull(payments.deletedAt),
      ),
    )
    .orderBy(desc(payments.paidAt));
}

/** Org-wide money-in list (Payments received page). */
export async function listPayments(db: Database, organizationId: string) {
  return db
    .select({
      id: payments.id,
      amountMinor: payments.amountMinor,
      currency: payments.currency,
      method: payments.method,
      paidAt: payments.paidAt,
      invoiceId: payments.invoiceId,
      displayNumber: invoices.displayNumber,
      customerName: customers.name,
    })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .where(
      and(
        eq(payments.organizationId, organizationId),
        isNull(payments.deletedAt),
      ),
    )
    .orderBy(desc(payments.paidAt));
}

/**
 * Overdue cron (brief §196): sent/partial invoices past their due date flip
 * to overdue, audited as a SYSTEM actor per org in its own transaction so
 * the RLS backstop stays armed and one bad org cannot poison the batch.
 */
export async function markOverdueInvoices(
  db: Database,
  today: string,
): Promise<{ marked: number }> {
  const candidates = await db
    .select({ id: invoices.id, organizationId: invoices.organizationId })
    .from(invoices)
    .where(
      and(
        inArray(invoices.status, ["sent", "partial"]),
        lt(invoices.dueDate, today),
        isNull(invoices.deletedAt),
      ),
    );

  let marked = 0;
  const byOrg = new Map<string, string[]>();
  for (const c of candidates) {
    byOrg.set(c.organizationId, [
      ...(byOrg.get(c.organizationId) ?? []),
      c.id,
    ]);
  }
  for (const [organizationId, ids] of byOrg) {
    const ctx: ActorContext = {
      actorType: "system",
      actorId: null,
      organizationId,
    };
    await withOrgTransaction(db, organizationId, async (tx) => {
      for (const id of ids) {
        // re-check under lock: a payment may have landed since the scan
        const [inv] = await tx
          .select({ status: invoices.status, dueDate: invoices.dueDate })
          .from(invoices)
          .where(
            and(eq(invoices.id, id), eq(invoices.organizationId, organizationId)),
          )
          .for("update");
        if (!inv || !["sent", "partial"].includes(inv.status)) continue;
        if (!inv.dueDate || inv.dueDate >= today) continue;
        assertTransition(inv.status as InvoiceStatus, "overdue");
        await tx
          .update(invoices)
          .set({ status: "overdue", updatedAt: new Date() })
          .where(eq(invoices.id, id));
        await writeAudit(tx, ctx, {
          action: "invoice.overdue",
          entityType: "invoice",
          entityId: id,
          changes: { before: { status: inv.status }, after: { status: "overdue" } },
        });
        marked++;
      }
    });
  }
  return { marked };
}
