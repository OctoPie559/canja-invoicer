import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { NotFoundError, ValidationError } from "@/lib/domain/errors";
import type { ActorContext } from "@/lib/audit/context";
import {
  createInvoiceDraft,
  getInvoice,
  issueInvoice,
} from "@/lib/services/invoices";
import {
  listInvoicePayments,
  listPayments,
  markOverdueInvoices,
  recordPayment,
} from "@/lib/services/payments";
import { createCustomer } from "@/lib/services/customers";
import { createTestDb } from "../helpers/db";
import {
  createTwoOrgFixture,
  setPlan,
  upgradeToPro,
  type TwoOrgFixture,
} from "../helpers/fixtures";

describe("payments + overdue cron (slice 4)", () => {
  let db: Database;
  let fx: TwoOrgFixture;
  let customerA: string;

  const actorInA = (): ActorContext => ({
    actorType: "user",
    actorId: fx.alice.id,
    organizationId: fx.orgA,
  });
  const actorInB = (): ActorContext => ({
    actorType: "user",
    actorId: fx.bob.id,
    organizationId: fx.orgB,
  });

  async function issued(
    currency: "KES" | "USD" = "KES",
    fxRateToBase?: string,
    dueDate = "2099-01-01",
    issueDate = "2026-07-07",
  ): Promise<string> {
    const { invoiceId } = await createInvoiceDraft(db, actorInA(), {
      customerId: customerA,
      currency,
      lines: [
        {
          description: "Work",
          quantity: "1",
          unitPrice: "1000.00", // total 1000.00, no tax
          discountBps: 0,
          taxRateBps: 0,
        },
      ],
    });
    const draft = await getInvoice(db, fx.orgA, invoiceId);
    await issueInvoice(db, actorInA(), {
      id: invoiceId,
      version: draft!.version,
      issueDate,
      dueDate,
      ...(fxRateToBase ? { fxRateToBase } : {}),
    });
    return invoiceId;
  }

  const payment = (invoiceId: string, amount: string, extra = {}) => ({
    invoiceId,
    amount,
    currency: "KES" as const,
    method: "mpesa" as const,
    paidAt: "2026-07-07",
    ...extra,
  });

  beforeAll(async () => {
    ({ db } = await createTestDb());
    fx = await createTwoOrgFixture(db);
    const a = await createCustomer(db, actorInA(), { name: "Acme Ltd" });
    customerA = a.customerId;
  });

  it("partial payment → partial, remainder → paid, both audited", async () => {
    const invoiceId = await issued();
    const first = await recordPayment(db, actorInA(), payment(invoiceId, "400.00"));
    expect(first.invoiceStatus).toBe("partial");
    let inv = await getInvoice(db, fx.orgA, invoiceId);
    expect(inv!.status).toBe("partial");
    expect(inv!.amountPaidMinor).toBe(40_000n);

    const second = await recordPayment(db, actorInA(), payment(invoiceId, "600.00"));
    expect(second.invoiceStatus).toBe("paid");
    inv = await getInvoice(db, fx.orgA, invoiceId);
    expect(inv!.status).toBe("paid");
    expect(inv!.amountPaidMinor).toBe(100_000n);

    const audits = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityId, invoiceId),
          eq(auditLog.entityType, "invoice"),
        ),
      );
    const actions = audits.map((a) => a.action);
    expect(actions).toContain("invoice.partially_paid");
    expect(actions).toContain("invoice.paid");

    const rows = await listInvoicePayments(db, fx.orgA, invoiceId);
    expect(rows).toHaveLength(2);
    // paid is terminal: no more payments
    await expect(
      recordPayment(db, actorInA(), payment(invoiceId, "1.00")),
    ).rejects.toThrow(ValidationError);
  });

  it("cross-currency settlement records both sides and the delta", async () => {
    await upgradeToPro(db, fx.orgA);
    const invoiceId = await issued("USD", "129.55"); // USD 1,000.00 total
    // KES 130,000 at 1 KES = 0.00771605 USD → USD 1,003.09: paid + delta 3.09
    const res = await recordPayment(
      db,
      actorInA(),
      payment(invoiceId, "130000.00", { fxRateUsed: "0.00771605" }),
    );
    expect(res.invoiceStatus).toBe("paid");
    const [row] = await listInvoicePayments(db, fx.orgA, invoiceId);
    expect(row.currency).toBe("KES");
    expect(row.amountMinor).toBe(13_000_000n);
    expect(row.amountInInvoiceCurrencyMinor).toBe(100_309n);
    expect(row.settlementDeltaMinor).toBe(309n);
    await setPlan(db, fx.orgA, "free");
  });

  it("drafts/void cannot take payments; rate rules enforced", async () => {
    const { invoiceId: draftId } = await createInvoiceDraft(db, actorInA(), {
      customerId: customerA,
      currency: "KES",
      lines: [
        { description: "W", quantity: "1", unitPrice: "10.00", discountBps: 0, taxRateBps: 0 },
      ],
    });
    await expect(
      recordPayment(db, actorInA(), payment(draftId, "10.00")),
    ).rejects.toThrow(/Issue the invoice/);

    const invoiceId = await issued();
    await expect(
      recordPayment(db, actorInA(), payment(invoiceId, "10.00", { fxRateUsed: "1.0" })),
    ).rejects.toThrow(ValidationError); // same-currency payment takes no rate
  });

  it("org B cannot record against org A's invoice", async () => {
    const invoiceId = await issued();
    await expect(
      recordPayment(db, actorInB(), payment(invoiceId, "10.00")),
    ).rejects.toThrow(NotFoundError);
    expect(
      (await listPayments(db, fx.orgB)).find((p) => p.invoiceId === invoiceId),
    ).toBeUndefined();
  });

  it("overdue cron flips past-due sent/partial, audited as system, idempotent", async () => {
    const pastDue = await issued("KES", undefined, "2026-01-15", "2026-01-01");
    const partial = await issued("KES", undefined, "2026-01-15", "2026-01-01");
    await recordPayment(db, actorInA(), payment(partial, "100.00"));
    const future = await issued("KES", undefined, "2099-01-01");

    const { marked } = await markOverdueInvoices(db, "2026-07-07");
    expect(marked).toBeGreaterThanOrEqual(2);
    expect((await getInvoice(db, fx.orgA, pastDue))!.status).toBe("overdue");
    expect((await getInvoice(db, fx.orgA, partial))!.status).toBe("overdue");
    expect((await getInvoice(db, fx.orgA, future))!.status).toBe("sent");

    // idempotent: a second run marks nothing new
    const again = await markOverdueInvoices(db, "2026-07-07");
    expect(again.marked).toBe(0);

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityId, pastDue),
          eq(auditLog.action, "invoice.overdue"),
        ),
      );
    expect(audit.actorType).toBe("system");
    expect(audit.actorId).toBeNull();

    // an overdue invoice still takes payments; full cover → paid
    const res = await recordPayment(db, actorInA(), payment(pastDue, "1000.00"));
    expect(res.invoiceStatus).toBe("paid");
  });
});
