import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import {
  EntitlementError,
  NotFoundError,
  ValidationError,
} from "@/lib/domain/errors";
import type { ActorContext } from "@/lib/audit/context";
import {
  createRecurring,
  deleteRecurring,
  generateDueRecurringInvoices,
  getRecurring,
  listGeneratedInvoices,
  listRecurring,
  recurringAction,
  updateRecurring,
} from "@/lib/services/recurring";
import { getInvoice } from "@/lib/services/invoices";
import { createCustomer } from "@/lib/services/customers";
import { createTestDb } from "../helpers/db";
import {
  createTwoOrgFixture,
  setPlan,
  upgradeToPro,
  type TwoOrgFixture,
} from "../helpers/fixtures";

describe("recurring invoices (slice 7)", () => {
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

  const scheduleInput = (overrides: Record<string, unknown> = {}) => ({
    customerId: customerA,
    currency: "KES" as const,
    frequency: "monthly" as const,
    intervalCount: 1,
    startDate: "2026-07-01",
    autoIssue: "draft" as const,
    lines: [
      {
        description: "Monthly retainer",
        quantity: "1",
        unitPrice: "5000.00",
        discountBps: 0,
        taxRateBps: 1600,
      },
    ],
    ...overrides,
  });

  beforeAll(async () => {
    ({ db } = await createTestDb());
    fx = await createTwoOrgFixture(db);
    await upgradeToPro(db, fx.orgA); // recurring is Pro-gated
    customerA = (await createCustomer(db, actorInA(), { name: "Acme Ltd" }))
      .customerId;
  });

  it("is Pro-gated on create", async () => {
    await setPlan(db, fx.orgA, "free");
    await expect(
      createRecurring(db, actorInA(), scheduleInput()),
    ).rejects.toThrow(EntitlementError);
    await setPlan(db, fx.orgA, "pro");
  });

  it("creates, updates, pauses/resumes, and ends a schedule — audited", async () => {
    const { recurringId } = await createRecurring(db, actorInA(), scheduleInput());
    let sched = await getRecurring(db, fx.orgA, recurringId);
    expect(sched!.status).toBe("active");
    expect(sched!.frequency).toBe("monthly");
    expect(sched!.items).toHaveLength(1);

    await updateRecurring(db, actorInA(), {
      id: recurringId,
      version: sched!.version,
      ...scheduleInput({ frequency: "weekly", intervalCount: 2 }),
    });
    sched = await getRecurring(db, fx.orgA, recurringId);
    expect(sched!.frequency).toBe("weekly");
    expect(sched!.intervalCount).toBe(2);

    await recurringAction(db, actorInA(), { id: recurringId, action: "pause" });
    expect((await getRecurring(db, fx.orgA, recurringId))!.status).toBe("paused");
    await recurringAction(db, actorInA(), { id: recurringId, action: "resume" });
    expect((await getRecurring(db, fx.orgA, recurringId))!.status).toBe("active");
    await recurringAction(db, actorInA(), { id: recurringId, action: "end" });
    expect((await getRecurring(db, fx.orgA, recurringId))!.status).toBe("ended");
    // ended is terminal
    await expect(
      recurringAction(db, actorInA(), { id: recurringId, action: "resume" }),
    ).rejects.toThrow(ValidationError);

    const actions = (
      await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, recurringId))
    ).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "recurring.created",
        "recurring.updated",
        "recurring.paused",
        "recurring.resumed",
        "recurring.ended",
      ]),
    );
  });

  it("generates a DRAFT identical to a hand-made one, and advances the schedule", async () => {
    const { recurringId } = await createRecurring(db, actorInA(), scheduleInput());
    // due today (start 2026-07-01, now well after)
    const { generated } = await generateDueRecurringInvoices(
      db,
      new Date("2026-07-01T06:00:00Z"),
    );
    expect(generated).toBeGreaterThanOrEqual(1);

    const generatedInvoices = await listGeneratedInvoices(db, fx.orgA, recurringId);
    expect(generatedInvoices).toHaveLength(1);
    const inv = await getInvoice(db, fx.orgA, generatedInvoices[0].id);
    expect(inv!.status).toBe("draft");
    // 5,000 + 16% VAT = 5,800.00 — same math as a hand-made invoice
    expect(inv!.totalMinor).toBe(580_000n);
    expect(inv!.issueDate).toBe("2026-07-01");
    expect(inv!.lines).toHaveLength(1);
    expect(inv!.lines[0].description).toBe("Monthly retainer");

    // the schedule advanced one month and stays active
    const sched = await getRecurring(db, fx.orgA, recurringId);
    expect(sched!.status).toBe("active");
    expect(sched!.nextRunAt!.toISOString().slice(0, 10)).toBe("2026-08-01");

    // audited as SYSTEM
    const [audit] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityId, recurringId),
          eq(auditLog.action, "recurring.generated"),
        ),
      );
    expect(audit.actorType).toBe("system");
    expect(audit.actorId).toBeNull();

    // running again the same day does nothing (already advanced past now)
    const again = await generateDueRecurringInvoices(db, new Date("2026-07-01T07:00:00Z"));
    expect(
      (await listGeneratedInvoices(db, fx.orgA, recurringId)).length,
    ).toBe(1);
    void again;
  });

  it("auto-issue schedules generate an ISSUED invoice (base currency)", async () => {
    const { recurringId } = await createRecurring(
      db,
      actorInA(),
      scheduleInput({ autoIssue: "issue", startDate: "2026-07-02" }),
    );
    await generateDueRecurringInvoices(db, new Date("2026-07-02T06:00:00Z"));
    const [gen] = await listGeneratedInvoices(db, fx.orgA, recurringId);
    const inv = await getInvoice(db, fx.orgA, gen.id);
    expect(inv!.status).toBe("sent"); // issued automatically
    expect(inv!.displayNumber).toMatch(/^INV-\d{6}$/);
  });

  it("foreign-currency auto-issue falls back to a draft (FX is a human call)", async () => {
    const { recurringId } = await createRecurring(
      db,
      actorInA(),
      scheduleInput({ currency: "USD", autoIssue: "issue", startDate: "2026-07-03" }),
    );
    await generateDueRecurringInvoices(db, new Date("2026-07-03T06:00:00Z"));
    const [gen] = await listGeneratedInvoices(db, fx.orgA, recurringId);
    const inv = await getInvoice(db, fx.orgA, gen.id);
    expect(inv!.status).toBe("draft"); // not auto-issued — needs an FX rate
    expect(inv!.currency).toBe("USD");
  });

  it("a paused schedule and a downgraded org generate nothing", async () => {
    const paused = await createRecurring(
      db,
      actorInA(),
      scheduleInput({ startDate: "2026-07-04" }),
    );
    await recurringAction(db, actorInA(), { id: paused.recurringId, action: "pause" });
    await generateDueRecurringInvoices(db, new Date("2026-07-04T06:00:00Z"));
    expect(
      (await listGeneratedInvoices(db, fx.orgA, paused.recurringId)).length,
    ).toBe(0);

    // downgrade: an active schedule is left untouched (not advanced)
    const active = await createRecurring(
      db,
      actorInA(),
      scheduleInput({ startDate: "2026-07-05" }),
    );
    await setPlan(db, fx.orgA, "free");
    await generateDueRecurringInvoices(db, new Date("2026-07-05T06:00:00Z"));
    expect(
      (await listGeneratedInvoices(db, fx.orgA, active.recurringId)).length,
    ).toBe(0);
    const still = await getRecurring(db, fx.orgA, active.recurringId);
    expect(still!.nextRunAt!.toISOString().slice(0, 10)).toBe("2026-07-05"); // not advanced
    await setPlan(db, fx.orgA, "pro");
  });

  it("stops at the end date", async () => {
    const { recurringId } = await createRecurring(
      db,
      actorInA(),
      scheduleInput({ startDate: "2026-07-06", endDate: "2026-07-20" }),
    );
    // run 1 at 2026-07-06 → generate, next run 2026-08-06 which is past end
    await generateDueRecurringInvoices(db, new Date("2026-07-06T06:00:00Z"));
    const sched = await getRecurring(db, fx.orgA, recurringId);
    expect(sched!.status).toBe("ended");
    expect((await listGeneratedInvoices(db, fx.orgA, recurringId)).length).toBe(1);
  });

  it("a rejected lifecycle action changes nothing and writes no audit row", async () => {
    const { recurringId } = await createRecurring(db, actorInA(), scheduleInput());
    await recurringAction(db, actorInA(), { id: recurringId, action: "end" });

    const auditsBefore = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, recurringId));
    const versionBefore = (await getRecurring(db, fx.orgA, recurringId))!.version;

    // ended is terminal — resume is an illegal transition
    await expect(
      recurringAction(db, actorInA(), { id: recurringId, action: "resume" }),
    ).rejects.toThrow(ValidationError);

    const after = await getRecurring(db, fx.orgA, recurringId);
    expect(after!.status).toBe("ended"); // unchanged
    expect(after!.version).toBe(versionBefore); // no silent bump
    const auditsAfter = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, recurringId));
    expect(auditsAfter).toHaveLength(auditsBefore.length); // no orphan audit
  });

  it("tenant isolation: org B cannot read or manage org A's schedule", async () => {
    const { recurringId } = await createRecurring(db, actorInA(), scheduleInput());
    expect(await getRecurring(db, fx.orgB, recurringId)).toBeNull();
    await expect(
      recurringAction(db, actorInB(), { id: recurringId, action: "pause" }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      deleteRecurring(db, actorInB(), { id: recurringId, version: 1 }),
    ).rejects.toThrow(NotFoundError);
    expect(
      (await listRecurring(db, fx.orgB)).find((r) => r.id === recurringId),
    ).toBeUndefined();
  });
});
