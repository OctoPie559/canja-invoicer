import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { auditLog, invoices, payments } from "@/lib/db/schema";
import { newId } from "@/lib/domain/ids";
import {
  NotFoundError,
  PermissionError,
  ValidationError,
} from "@/lib/domain/errors";
import type { ActorContext } from "@/lib/audit/context";
import {
  addComment,
  deleteComment,
  listComments,
} from "@/lib/services/comments";
import {
  createCustomer,
  getCustomerReceivables,
  getCustomerStatement,
  getCustomerTimeline,
} from "@/lib/services/customers";
import {
  acceptInvitation,
  inviteMember,
} from "@/lib/services/organizations";
import { createTestDb } from "../helpers/db";
import {
  createTwoOrgFixture,
  seedUser,
  upgradeToPro,
  type TwoOrgFixture,
} from "../helpers/fixtures";

describe("customer workspace (comments, receivables, statement)", () => {
  let db: Database;
  let fx: TwoOrgFixture;
  let customerId: string;
  let viewer: { id: string; email: string };

  const actorInA = (): ActorContext => ({
    actorType: "user",
    actorId: fx.alice.id,
    organizationId: fx.orgA,
  });

  beforeAll(async () => {
    ({ db } = await createTestDb());
    fx = await createTwoOrgFixture(db);
    await upgradeToPro(db, fx.orgA);
    ({ customerId } = await createCustomer(db, actorInA(), {
      name: "Njogu-ini Career Association",
      email: "info@njogu-ini.example",
    }));
    viewer = await seedUser(db, "viewer");
    const { invitationId } = await inviteMember(db, actorInA(), {
      email: viewer.email,
      role: "viewer",
    });
    await acceptInvitation(db, { userId: viewer.id }, { invitationId });
  });

  it("adds a comment with an audit row in the same transaction", async () => {
    const { commentId } = await addComment(db, actorInA(), {
      entityType: "customer",
      entityId: customerId,
      body: "Prefers M-Pesa; call before invoicing.",
    });
    const listed = await listComments(db, fx.orgA, "customer", customerId);
    expect(listed.map((c) => c.id)).toContain(commentId);
    expect(listed[0].authorName).toBeTruthy();

    const audited = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.entityId, customerId));
    expect(audited.map((a) => a.action)).toContain("comment.added");
  });

  it("author can delete their own comment; another member cannot", async () => {
    const { commentId } = await addComment(db, actorInA(), {
      entityType: "customer",
      entityId: customerId,
      body: "temp note",
    });
    // dave joins as member and tries to delete alice's comment
    const dave = await seedUser(db, "dave-member");
    const { invitationId } = await inviteMember(db, actorInA(), {
      email: dave.email,
      role: "member",
    });
    await acceptInvitation(db, { userId: dave.id }, { invitationId });
    await expect(
      deleteComment(
        db,
        { actorType: "user", actorId: dave.id, organizationId: fx.orgA },
        commentId,
      ),
    ).rejects.toThrow(ValidationError);
    // the author may
    await deleteComment(db, actorInA(), commentId);
    const listed = await listComments(db, fx.orgA, "customer", customerId);
    expect(listed.map((c) => c.id)).not.toContain(commentId);
  });

  it("viewers cannot comment; comments cannot target foreign customers", async () => {
    await expect(
      addComment(
        db,
        { actorType: "user", actorId: viewer.id, organizationId: fx.orgA },
        { entityType: "customer", entityId: customerId, body: "hi" },
      ),
    ).rejects.toThrow(PermissionError);

    const { customerId: foreign } = await createCustomer(
      db,
      { actorType: "user", actorId: fx.bob.id, organizationId: fx.orgB },
      { name: "Org B Client" },
    );
    await expect(
      addComment(db, actorInA(), {
        entityType: "customer",
        entityId: foreign,
        body: "cross-tenant note",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("timeline entries carry the actor's name", async () => {
    const timeline = await getCustomerTimeline(db, fx.orgA, customerId);
    const created = timeline.find((t) => t.action === "customer.created");
    expect(created?.actorName).toBe("alice");
  });

  it("receivables group by currency and never mix them", async () => {
    // admin fixture rows until the invoice service lands in slice 2
    const seedInvoice = async (row: {
      status: "sent" | "partial" | "paid" | "overdue";
      currency: string;
      totalMinor: bigint;
      amountPaidMinor?: bigint;
      issuedAt?: Date;
    }) =>
      db.insert(invoices).values({
        id: newId(),
        organizationId: fx.orgA,
        customerId,
        status: row.status,
        currency: row.currency,
        totalMinor: row.totalMinor,
        amountPaidMinor: row.amountPaidMinor ?? 0n,
        issuedAt: row.issuedAt ?? new Date("2026-07-01T10:00:00Z"),
      });

    await seedInvoice({ status: "sent", currency: "KES", totalMinor: 350_000n });
    await seedInvoice({
      status: "partial",
      currency: "KES",
      totalMinor: 200_000n,
      amountPaidMinor: 50_000n,
    });
    await seedInvoice({ status: "sent", currency: "USD", totalMinor: 10_000n });
    await seedInvoice({
      status: "paid",
      currency: "KES",
      totalMinor: 100_000n,
      amountPaidMinor: 100_000n,
    });

    const receivables = await getCustomerReceivables(db, fx.orgA, customerId);
    expect(receivables.length).toBe(2);
    const kes = receivables.find((r) => r.currency === "KES");
    const usd = receivables.find((r) => r.currency === "USD");
    // 3,500 + (2,000 - 500) = 5,000.00 KES; paid invoice contributes nothing
    expect(kes?.outstanding.amountMinor).toBe(500_000n);
    expect(usd?.outstanding.amountMinor).toBe(10_000n);
  });

  it("statement computes opening/invoiced/received/closing per currency", async () => {
    // seed one older KES invoice + payment before the period, activity inside
    const oldInvoiceId = newId();
    await db.insert(invoices).values({
      id: oldInvoiceId,
      organizationId: fx.orgA,
      customerId,
      status: "partial",
      currency: "KES",
      displayNumber: "INV-OLD",
      totalMinor: 400_000n,
      amountPaidMinor: 150_000n,
      issuedAt: new Date("2026-05-10T09:00:00Z"),
    });
    await db.insert(payments).values({
      id: newId(),
      organizationId: fx.orgA,
      invoiceId: oldInvoiceId,
      amountMinor: 150_000n,
      currency: "KES",
      method: "mpesa",
      paidAt: new Date("2026-06-01T09:00:00Z"),
    });
    await db.insert(payments).values({
      id: newId(),
      organizationId: fx.orgA,
      invoiceId: oldInvoiceId,
      amountMinor: 100_000n,
      currency: "KES",
      method: "cash",
      paidAt: new Date("2026-07-02T09:00:00Z"),
    });

    const statement = await getCustomerStatement(db, fx.orgA, customerId, {
      from: new Date("2026-07-01T00:00:00Z"),
      to: new Date("2026-08-01T00:00:00Z"),
    });
    const kes = statement.find((s) => s.currency === "KES");
    expect(kes).toBeDefined();
    // opening: INV-OLD 4,000 - payment 1,500 = 2,500.00
    expect(kes!.opening.amountMinor).toBe(250_000n);
    // in period: receivables-test invoices issued 2026-07-01 (3,500 + 2,000
    // + 1,000 paid one) = 6,500 invoiced; 1,000 received via cash payment
    expect(kes!.invoiced.amountMinor).toBe(650_000n);
    expect(kes!.received.amountMinor).toBe(100_000n);
    // closing = 2,500 + 6,500 - 1,000 = 8,000.00
    expect(kes!.closing.amountMinor).toBe(800_000n);
    // lines are chronological and never mix currencies
    expect(kes!.lines.every((l) => l.amount.currency === "KES")).toBe(true);
    const usd = statement.find((s) => s.currency === "USD");
    expect(usd?.invoiced.amountMinor).toBe(10_000n);
  });

  it("statement and receivables are tenant-isolated", async () => {
    const foreign = await getCustomerReceivables(db, fx.orgB, customerId);
    expect(foreign).toEqual([]);
    const stmt = await getCustomerStatement(db, fx.orgB, customerId, {
      from: new Date("2026-01-01"),
      to: new Date("2027-01-01"),
    });
    expect(stmt).toEqual([]);
  });
});
