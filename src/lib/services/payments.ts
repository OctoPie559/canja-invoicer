import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
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

export async function recordPayment(
  db: Database,
  ctx: ActorContext,
  input: RecordPaymentInput,
): Promise<{ paymentId: string; invoiceStatus: InvoiceStatus }> {
  const data = recordPaymentSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("payment.record");
  const paymentId = newId();

  const status = await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "payment.record");

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
    if (!isOutstanding(invoice.status as InvoiceStatus)) {
      throw new ValidationError(
        invoice.status === "draft"
          ? "Issue the invoice before recording payments"
          : `A ${invoice.status} invoice cannot take payments`,
      );
    }

    const received = Money.parse(data.amount, data.currency);
    const total = invoice.totalMinor ?? 0n;
    const paidBefore = invoice.amountPaidMinor ?? 0n;
    const settlement = computeSettlement({
      amountMinor: received.amountMinor,
      currency: data.currency,
      invoiceCurrency: invoice.currency,
      fxRateUsed: data.fxRateUsed ?? null,
      balanceDueMinor: total - paidBefore,
    });

    const paidAfter =
      paidBefore + settlement.amountInInvoiceCurrency.amountMinor;
    const nextStatus = statusAfterPayment(paidAfter, total);
    assertTransition(invoice.status as InvoiceStatus, nextStatus);

    await tx.insert(payments).values({
      id: paymentId,
      organizationId: ctx.organizationId,
      invoiceId: invoice.id,
      amountMinor: received.amountMinor,
      currency: received.currency,
      fxRateUsed: data.fxRateUsed ?? null,
      amountInInvoiceCurrencyMinor:
        settlement.amountInInvoiceCurrency.amountMinor,
      settlementDeltaMinor: settlement.settlementDelta.amountMinor,
      method: data.method,
      source: "manual",
      providerTransactionId: data.reference ?? null,
      paidAt: new Date(`${data.paidAt}T00:00:00Z`),
      recordedBy: ctx.actorId,
      notes: data.notes ?? null,
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
          method: data.method,
          invoiceStatus: nextStatus,
        }),
      },
    });
    // the invoice's own timeline shows the status change too
    await writeAudit(tx, ctx, {
      action:
        nextStatus === "paid" ? "invoice.paid" : "invoice.partially_paid",
      entityType: "invoice",
      entityId: invoice.id,
      changes: {
        before: { status: invoice.status, amountPaidMinor: String(paidBefore) },
        after: { status: nextStatus, amountPaidMinor: String(paidAfter) },
      },
    });
    return nextStatus;
  });
  return { paymentId, invoiceStatus: status };
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
