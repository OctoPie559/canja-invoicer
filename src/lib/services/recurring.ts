import { and, asc, desc, eq, isNull, lte } from "drizzle-orm";
import type { Database, Transaction } from "@/lib/db/client";
import { withOrgTransaction } from "@/lib/db/tx";
import {
  auditLog,
  customers,
  invoiceLineItems,
  invoices,
  organizationSettings,
  recurringInvoiceItems,
  recurringInvoices,
  subscriptions,
  user,
} from "@/lib/db/schema";
import { newId } from "@/lib/domain/ids";
import { Money } from "@/lib/domain/money";
import { computeInvoiceTotals } from "@/lib/domain/invoice-math";
import { dueDateFor } from "@/lib/domain/payment-terms";
import {
  assertRecurringTransition,
  computeNextRun,
  isDue,
  reachedEnd,
  type RecurringFrequency,
  type RecurringStatus,
} from "@/lib/domain/recurring-schedule";
import {
  ConflictError,
  NotFoundError,
  PermissionError,
} from "@/lib/domain/errors";
import { writeAudit } from "@/lib/audit/write";
import { jsonSafe } from "@/lib/audit/diff";
import { type ActorContext, systemActor } from "@/lib/audit/context";
import { authorize } from "@/lib/authz/permissions";
import {
  PLAN_ENTITLEMENTS,
  requireEntitlement,
  type Plan,
} from "@/lib/authz/entitlements";
import { getMembership } from "./organizations";
import { issueInvoice } from "./invoices";
import {
  createRecurringSchema,
  recurringActionSchema,
  updateRecurringSchema,
  type CreateRecurringInput,
  type RecurringActionInput,
  type UpdateRecurringInput,
} from "@/lib/validation/recurring";

/**
 * Recurring invoices (brief §107, slice 7) — Pro-gated schedule templates.
 * A daily cron generates an invoice per due schedule, audited as a SYSTEM
 * actor; generated invoices are byte-identical to hand-made ones (same
 * draft shape, same issue flow). Each run either leaves a DRAFT for review
 * or, in base currency, auto-issues. Foreign-currency schedules always
 * generate drafts — the FX rate is a human decision made at issue (§5.6).
 */

type DraftLines = Array<{
  productId?: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discountBps: number;
  taxRateBps: number;
}>;

async function orgContext(tx: Transaction, organizationId: string) {
  const [settings] = await tx
    .select({
      baseCurrency: organizationSettings.baseCurrency,
      defaultPaymentTermsDays: organizationSettings.defaultPaymentTermsDays,
    })
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
    defaultPaymentTermsDays: settings.defaultPaymentTermsDays,
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

async function lockSchedule(
  tx: Transaction,
  organizationId: string,
  id: string,
) {
  const [row] = await tx
    .select()
    .from(recurringInvoices)
    .where(
      and(
        eq(recurringInvoices.id, id),
        eq(recurringInvoices.organizationId, organizationId),
        isNull(recurringInvoices.deletedAt),
      ),
    )
    .for("update");
  if (!row) throw new NotFoundError("Recurring schedule");
  return row;
}

async function insertItems(
  tx: Transaction,
  organizationId: string,
  recurringInvoiceId: string,
  currency: string,
  lines: DraftLines,
): Promise<void> {
  await tx.insert(recurringInvoiceItems).values(
    lines.map((l, i) => ({
      id: newId(),
      organizationId,
      recurringInvoiceId,
      productId: l.productId ?? null,
      description: l.description,
      quantity: l.quantity,
      unitPriceMinor: Money.parse(l.unitPrice, currency).amountMinor,
      discountBps: l.discountBps,
      taxRateBps: l.taxRateBps,
      position: i,
    })),
  );
}

// ---------------------------------------------------------------------------
// lifecycle

export async function createRecurring(
  db: Database,
  ctx: ActorContext,
  input: CreateRecurringInput,
): Promise<{ recurringId: string }> {
  const data = createRecurringSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("recurring.manage");
  const recurringId = newId();

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "recurring.manage");
    const org = await orgContext(tx, ctx.organizationId);
    // recurring invoices are a Pro capability (brief §4.4)
    requireEntitlement(org.plan, "recurringInvoices");
    if (data.currency !== org.baseCurrency) {
      requireEntitlement(org.plan, "multiCurrency");
    }
    await assertCustomerInOrg(tx, ctx.organizationId, data.customerId);

    await tx.insert(recurringInvoices).values({
      id: recurringId,
      organizationId: ctx.organizationId,
      customerId: data.customerId,
      status: "active",
      currency: data.currency,
      frequency: data.frequency,
      intervalCount: data.intervalCount,
      nextRunAt: new Date(`${data.startDate}T00:00:00Z`),
      endDate: data.endDate ?? null,
      autoIssue: data.autoIssue,
      notes: data.notes,
      terms: data.terms,
    });
    await insertItems(tx, ctx.organizationId, recurringId, data.currency, data.lines);
    await writeAudit(tx, ctx, {
      action: "recurring.created",
      entityType: "recurring_invoice",
      entityId: recurringId,
      changes: {
        after: jsonSafe({
          customerId: data.customerId,
          frequency: data.frequency,
          intervalCount: data.intervalCount,
          autoIssue: data.autoIssue,
          lineCount: data.lines.length,
        }),
      },
    });
  });
  return { recurringId };
}

export async function updateRecurring(
  db: Database,
  ctx: ActorContext,
  input: UpdateRecurringInput,
): Promise<void> {
  const data = updateRecurringSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("recurring.manage");

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "recurring.manage");
    const before = await lockSchedule(tx, ctx.organizationId, data.id);
    if (before.status === "ended") {
      throw new ConflictError("Recurring schedule");
    }
    if (before.version !== data.version) throw new ConflictError("Recurring schedule");
    const org = await orgContext(tx, ctx.organizationId);
    requireEntitlement(org.plan, "recurringInvoices");
    if (data.currency !== org.baseCurrency) {
      requireEntitlement(org.plan, "multiCurrency");
    }
    await assertCustomerInOrg(tx, ctx.organizationId, data.customerId);

    await tx
      .delete(recurringInvoiceItems)
      .where(
        and(
          eq(recurringInvoiceItems.recurringInvoiceId, data.id),
          eq(recurringInvoiceItems.organizationId, ctx.organizationId),
        ),
      );
    await insertItems(tx, ctx.organizationId, data.id, data.currency, data.lines);
    await tx
      .update(recurringInvoices)
      .set({
        customerId: data.customerId,
        currency: data.currency,
        frequency: data.frequency,
        intervalCount: data.intervalCount,
        nextRunAt: new Date(`${data.startDate}T00:00:00Z`),
        endDate: data.endDate ?? null,
        autoIssue: data.autoIssue,
        notes: data.notes,
        terms: data.terms,
        version: before.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(recurringInvoices.id, data.id));
    await writeAudit(tx, ctx, {
      action: "recurring.updated",
      entityType: "recurring_invoice",
      entityId: data.id,
      changes: {
        after: jsonSafe({
          frequency: data.frequency,
          intervalCount: data.intervalCount,
          autoIssue: data.autoIssue,
          lineCount: data.lines.length,
        }),
      },
    });
  });
}

/** Pause / resume / end — the schedule status machine. */
export async function recurringAction(
  db: Database,
  ctx: ActorContext,
  input: RecurringActionInput,
): Promise<void> {
  const data = recurringActionSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("recurring.manage");
  const target: RecurringStatus =
    data.action === "pause" ? "paused" : data.action === "resume" ? "active" : "ended";
  const auditAction =
    data.action === "pause"
      ? "recurring.paused"
      : data.action === "resume"
        ? "recurring.resumed"
        : "recurring.ended";

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "recurring.manage");
    const schedule = await lockSchedule(tx, ctx.organizationId, data.id);
    assertRecurringTransition(schedule.status as RecurringStatus, target);
    await tx
      .update(recurringInvoices)
      .set({ status: target, version: schedule.version + 1, updatedAt: new Date() })
      .where(eq(recurringInvoices.id, data.id));
    await writeAudit(tx, ctx, {
      action: auditAction,
      entityType: "recurring_invoice",
      entityId: data.id,
      changes: { before: { status: schedule.status }, after: { status: target } },
    });
  });
}

export async function deleteRecurring(
  db: Database,
  ctx: ActorContext,
  input: { id: string; version: number },
): Promise<void> {
  if (!ctx.actorId) throw new PermissionError("recurring.manage");
  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "recurring.manage");
    const before = await lockSchedule(tx, ctx.organizationId, input.id);
    if (before.version !== input.version) throw new ConflictError("Recurring schedule");
    const now = new Date();
    await tx
      .update(recurringInvoiceItems)
      .set({ deletedAt: now })
      .where(
        and(
          eq(recurringInvoiceItems.recurringInvoiceId, input.id),
          eq(recurringInvoiceItems.organizationId, ctx.organizationId),
        ),
      );
    await tx
      .update(recurringInvoices)
      .set({ deletedAt: now, version: before.version + 1 })
      .where(eq(recurringInvoices.id, input.id));
    await writeAudit(tx, ctx, {
      action: "recurring.deleted",
      entityType: "recurring_invoice",
      entityId: input.id,
      changes: { before: { status: before.status } },
    });
  });
}

// ---------------------------------------------------------------------------
// generation cron (system actor)

export async function generateDueRecurringInvoices(
  db: Database,
  now: Date = new Date(),
): Promise<{ generated: number; issued: number }> {
  const due = await db
    .select({ id: recurringInvoices.id, organizationId: recurringInvoices.organizationId })
    .from(recurringInvoices)
    .where(
      and(
        eq(recurringInvoices.status, "active"),
        lte(recurringInvoices.nextRunAt, now),
        isNull(recurringInvoices.deletedAt),
      ),
    );

  const byOrg = new Map<string, string[]>();
  for (const d of due) {
    byOrg.set(d.organizationId, [...(byOrg.get(d.organizationId) ?? []), d.id]);
  }

  let generated = 0;
  const toIssue: Array<{
    organizationId: string;
    invoiceId: string;
    version: number;
    issueDate: string;
    dueDate: string;
  }> = [];

  for (const [organizationId, ids] of byOrg) {
    const ctx = systemActor(organizationId);
    for (const id of ids) {
      await withOrgTransaction(db, organizationId, async (tx) => {
        const org = await orgContext(tx, organizationId);
        // downgraded orgs stop generating (schedule left untouched, resumes
        // if they re-upgrade) — entitlement enforced server-side
        if (!PLAN_ENTITLEMENTS[org.plan].recurringInvoices) return;

        const schedule = await lockSchedule(tx, organizationId, id);
        if (!isDue(schedule, now)) return; // re-check under lock

        const items = await tx
          .select()
          .from(recurringInvoiceItems)
          .where(
            and(
              eq(recurringInvoiceItems.recurringInvoiceId, id),
              eq(recurringInvoiceItems.organizationId, organizationId),
              isNull(recurringInvoiceItems.deletedAt),
            ),
          )
          .orderBy(asc(recurringInvoiceItems.position));

        const runIso = schedule.nextRunAt!.toISOString().slice(0, 10);
        const next = computeNextRun(
          schedule.nextRunAt!,
          schedule.frequency as RecurringFrequency,
          schedule.intervalCount,
        );
        const ended = reachedEnd(next, schedule.endDate);

        // advance the schedule regardless, so a broken run never loops
        await tx
          .update(recurringInvoices)
          .set({
            nextRunAt: next,
            status: ended ? "ended" : "active",
            version: schedule.version + 1,
            updatedAt: now,
          })
          .where(eq(recurringInvoices.id, id));

        if (items.length === 0) return; // misconfigured; nothing to bill

        const totals = computeInvoiceTotals(
          items.map((it) => ({
            quantity: it.quantity,
            unitPriceMinor: it.unitPriceMinor ?? 0n,
            discountBps: it.discountBps,
            taxRateBps: it.taxRateBps,
          })),
          schedule.currency,
        );
        const invoiceId = newId();
        const dueDate = dueDateFor(runIso, org.defaultPaymentTermsDays);
        await tx.insert(invoices).values({
          id: invoiceId,
          organizationId,
          customerId: schedule.customerId,
          status: "draft",
          currency: schedule.currency,
          issueDate: runIso,
          dueDate,
          paymentTermsDays: org.defaultPaymentTermsDays,
          subtotalMinor: totals.subtotal.amountMinor,
          discountTotalMinor: totals.discountTotal.amountMinor,
          taxTotalMinor: totals.taxTotal.amountMinor,
          totalMinor: totals.total.amountMinor,
          amountPaidMinor: 0n,
          notes: schedule.notes,
          terms: schedule.terms,
          recurringInvoiceId: id,
        });
        await tx.insert(invoiceLineItems).values(
          items.map((it, i) => ({
            id: newId(),
            organizationId,
            invoiceId,
            productId: it.productId,
            description: it.description,
            quantity: it.quantity,
            unitPriceMinor: it.unitPriceMinor,
            discountBps: it.discountBps,
            taxRateBps: it.taxRateBps,
            lineTotalMinor: computeInvoiceTotals(
              [
                {
                  quantity: it.quantity,
                  unitPriceMinor: it.unitPriceMinor ?? 0n,
                  discountBps: it.discountBps,
                  taxRateBps: it.taxRateBps,
                },
              ],
              schedule.currency,
            ).total.amountMinor,
            position: i,
          })),
        );
        await writeAudit(tx, ctx, {
          action: "recurring.generated",
          entityType: "recurring_invoice",
          entityId: id,
          changes: { after: jsonSafe({ invoiceId, issueDate: runIso }) },
        });
        await writeAudit(tx, ctx, {
          action: "invoice.created",
          entityType: "invoice",
          entityId: invoiceId,
          changes: {
            after: jsonSafe({
              fromRecurringId: id,
              currency: schedule.currency,
              totalMinor: totals.total.amountMinor,
              lineCount: items.length,
            }),
          },
        });
        generated++;

        const [created] = await tx
          .select({ version: invoices.version })
          .from(invoices)
          .where(eq(invoices.id, invoiceId));
        // auto-issue only in base currency — a foreign-currency invoice needs
        // a human-set FX rate, so it lands as a draft for review
        if (schedule.autoIssue === "issue" && schedule.currency === org.baseCurrency) {
          toIssue.push({
            organizationId,
            invoiceId,
            version: created.version,
            issueDate: runIso,
            dueDate,
          });
        }
      });
    }
  }

  // auto-issue after commit — its own transaction, best-effort so one failure
  // (e.g. a downgraded org hitting its cap) never rolls back the generation
  let issued = 0;
  for (const t of toIssue) {
    try {
      await issueInvoice(db, systemActor(t.organizationId), {
        id: t.invoiceId,
        version: t.version,
        issueDate: t.issueDate,
        dueDate: t.dueDate,
      });
      issued++;
    } catch {
      // leaves the invoice as a draft — surfaced in the workspace
    }
  }
  return { generated, issued };
}

// ---------------------------------------------------------------------------
// reads

export async function listRecurring(db: Database, organizationId: string) {
  return db
    .select({
      id: recurringInvoices.id,
      status: recurringInvoices.status,
      currency: recurringInvoices.currency,
      frequency: recurringInvoices.frequency,
      intervalCount: recurringInvoices.intervalCount,
      nextRunAt: recurringInvoices.nextRunAt,
      endDate: recurringInvoices.endDate,
      autoIssue: recurringInvoices.autoIssue,
      customerId: recurringInvoices.customerId,
      customerName: customers.name,
      createdAt: recurringInvoices.createdAt,
    })
    .from(recurringInvoices)
    .innerJoin(
      customers,
      and(
        eq(customers.id, recurringInvoices.customerId),
        eq(customers.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(recurringInvoices.organizationId, organizationId),
        isNull(recurringInvoices.deletedAt),
      ),
    )
    .orderBy(desc(recurringInvoices.createdAt));
}

export async function getRecurring(
  db: Database,
  organizationId: string,
  id: string,
) {
  const [schedule] = await db
    .select()
    .from(recurringInvoices)
    .where(
      and(
        eq(recurringInvoices.id, id),
        eq(recurringInvoices.organizationId, organizationId),
        isNull(recurringInvoices.deletedAt),
      ),
    )
    .limit(1);
  if (!schedule) return null;
  const [customer] = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(eq(customers.id, schedule.customerId))
    .limit(1);
  const items = await db
    .select()
    .from(recurringInvoiceItems)
    .where(
      and(
        eq(recurringInvoiceItems.recurringInvoiceId, id),
        eq(recurringInvoiceItems.organizationId, organizationId),
        isNull(recurringInvoiceItems.deletedAt),
      ),
    )
    .orderBy(asc(recurringInvoiceItems.position));
  return { ...schedule, customer: customer ?? null, items };
}

/** Invoices this schedule has generated, newest first. */
export async function listGeneratedInvoices(
  db: Database,
  organizationId: string,
  recurringId: string,
) {
  return db
    .select({
      id: invoices.id,
      displayNumber: invoices.displayNumber,
      status: invoices.status,
      currency: invoices.currency,
      issueDate: invoices.issueDate,
      totalMinor: invoices.totalMinor,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        eq(invoices.recurringInvoiceId, recurringId),
        isNull(invoices.deletedAt),
      ),
    )
    .orderBy(desc(invoices.createdAt));
}

export async function getRecurringTimeline(
  db: Database,
  organizationId: string,
  recurringId: string,
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
        eq(auditLog.entityType, "recurring_invoice"),
        eq(auditLog.entityId, recurringId),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
