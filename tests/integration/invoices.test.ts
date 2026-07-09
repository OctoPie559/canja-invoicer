import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { auditLog, invoiceLineItems } from "@/lib/db/schema";
import {
  ConflictError,
  EntitlementError,
  ImmutableDocumentError,
  NotFoundError,
  PermissionError,
  ValidationError,
} from "@/lib/domain/errors";
import type { ActorContext } from "@/lib/audit/context";
import {
  createInvoiceDraft,
  deleteInvoiceDraft,
  getInvoice,
  getInvoiceTimeline,
  issueInvoice,
  issuedThisMonth,
  listInvoices,
  updateInvoiceDraft,
  voidInvoice,
} from "@/lib/services/invoices";
import { createCustomer } from "@/lib/services/customers";
import {
  createTaxRate,
  getInvoiceSettings,
  listTaxRates,
  updateDocNumbering,
  updateInvoiceDefaults,
  updateInvoiceNumbering,
  updatePaymentTermsDefault,
  updateTaxRate,
  deleteTaxRate,
} from "@/lib/services/settings";
import { updateOrganizationName } from "@/lib/services/organizations";
import { createTestDb } from "../helpers/db";
import {
  createTwoOrgFixture,
  setPlan,
  upgradeToPro,
  type TwoOrgFixture,
} from "../helpers/fixtures";

/** Shape of the Layer-2 snapshot fields these tests assert on. */
interface SnapshotShape {
  customer: { name: string };
  displayNumber: string;
  lines: unknown[];
  totals: { totalMinor: string };
  fxRateToBase: string | null;
  notes: string | null;
  terms: string | null;
  paymentTermsDays: number | null;
}

describe("invoices service", () => {
  let db: Database;
  let fx: TwoOrgFixture;
  let customerA: string;
  let customerB: string;

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
  /** bob acting inside org A — the cross-tenant attacker shape */
  const bobInA = (): ActorContext => ({
    actorType: "user",
    actorId: fx.bob.id,
    organizationId: fx.orgA,
  });

  const draftInput = (overrides: Record<string, unknown> = {}) => ({
    customerId: customerA,
    currency: "KES" as const,
    lines: [
      {
        description: "Consulting",
        quantity: "2",
        unitPrice: "1500.00",
        discountBps: 0,
        taxRateBps: 1600,
      },
    ],
    ...overrides,
  });

  const issueInput = (id: string, version: number) => ({
    id,
    version,
    issueDate: "2026-07-06",
    dueDate: "2026-08-05",
  });

  beforeAll(async () => {
    ({ db } = await createTestDb());
    fx = await createTwoOrgFixture(db);
    const a = await createCustomer(db, actorInA(), { name: "Acme Ltd" });
    customerA = a.customerId;
    const b = await createCustomer(db, actorInB(), { name: "Beta Ltd" });
    customerB = b.customerId;
  });

  // -------------------------------------------------------------------------
  // draft lifecycle

  it("creates a draft with computed totals and an audit row in the same tx", async () => {
    const { invoiceId } = await createInvoiceDraft(db, actorInA(), draftInput());
    const invoice = await getInvoice(db, fx.orgA, invoiceId);
    expect(invoice).not.toBeNull();
    expect(invoice!.status).toBe("draft");
    expect(invoice!.displayNumber).toBeNull();
    // 2 × 1500.00 = 3000.00; VAT 16% = 480.00; total 3480.00
    expect(invoice!.subtotalMinor).toBe(3000_00n);
    expect(invoice!.taxTotalMinor).toBe(480_00n);
    expect(invoice!.totalMinor).toBe(3480_00n);
    expect(invoice!.lines).toHaveLength(1);

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityId, invoiceId),
          eq(auditLog.action, "invoice.created"),
        ),
      );
    expect(audit).toBeDefined();
    expect(audit.organizationId).toBe(fx.orgA);
  });

  it("rejects a draft for another org's customer", async () => {
    await expect(
      createInvoiceDraft(db, actorInA(), draftInput({ customerId: customerB })),
    ).rejects.toThrow(NotFoundError);
  });

  it("free plan cannot draft in a non-base currency; pro can", async () => {
    await expect(
      createInvoiceDraft(db, actorInA(), draftInput({ currency: "USD" })),
    ).rejects.toThrow(EntitlementError);
    await upgradeToPro(db, fx.orgA);
    const { invoiceId } = await createInvoiceDraft(
      db,
      actorInA(),
      draftInput({ currency: "USD" }),
    );
    expect((await getInvoice(db, fx.orgA, invoiceId))!.currency).toBe("USD");
    await setPlan(db, fx.orgA, "free");
  });

  it("updates a draft: replaces lines wholesale and bumps the version", async () => {
    const { invoiceId } = await createInvoiceDraft(db, actorInA(), draftInput());
    const before = await getInvoice(db, fx.orgA, invoiceId);
    await updateInvoiceDraft(db, actorInA(), {
      id: invoiceId,
      version: before!.version,
      ...draftInput({
        lines: [
          {
            description: "Design work",
            quantity: "1",
            unitPrice: "500.00",
            discountBps: 1000,
            taxRateBps: 0,
          },
          {
            description: "Hosting",
            quantity: "12",
            unitPrice: "25.00",
            discountBps: 0,
            taxRateBps: 1600,
          },
        ],
      }),
    });
    const after = await getInvoice(db, fx.orgA, invoiceId);
    expect(after!.lines).toHaveLength(2);
    expect(after!.version).toBe(before!.version + 1);
    // 500 − 10% = 450; 12 × 25 = 300 + 16% (48) = 348 ⇒ total 798.00
    expect(after!.totalMinor).toBe(798_00n);

    // stale version → conflict
    await expect(
      updateInvoiceDraft(db, actorInA(), {
        id: invoiceId,
        version: before!.version,
        ...draftInput(),
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("soft-deletes a draft with its lines", async () => {
    const { invoiceId } = await createInvoiceDraft(db, actorInA(), draftInput());
    const invoice = await getInvoice(db, fx.orgA, invoiceId);
    await deleteInvoiceDraft(db, actorInA(), {
      id: invoiceId,
      version: invoice!.version,
    });
    expect(await getInvoice(db, fx.orgA, invoiceId)).toBeNull();
    const [line] = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoiceId));
    expect(line.deletedAt).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // issue — the one-way door

  it("issues a draft: display number, frozen totals, snapshot, audit", async () => {
    const { invoiceId } = await createInvoiceDraft(
      db,
      actorInA(),
      draftInput({ notes: "Thank you!", terms: "Net 30", paymentTermsDays: 30 }),
    );
    const draft = await getInvoice(db, fx.orgA, invoiceId);
    const { displayNumber } = await issueInvoice(
      db,
      actorInA(),
      issueInput(invoiceId, draft!.version),
    );
    expect(displayNumber).toMatch(/^INV-\d{6}$/);

    const issued = await getInvoice(db, fx.orgA, invoiceId);
    expect(issued!.status).toBe("sent");
    expect(issued!.displayNumber).toBe(displayNumber);
    expect(issued!.issuedAt).not.toBeNull();
    expect(issued!.publicToken).toBeTruthy();
    expect(issued!.fxRateToBase).toBeNull();

    const snapshot = issued!.snapshot as SnapshotShape;
    expect(snapshot.customer.name).toBe("Acme Ltd");
    expect(snapshot.displayNumber).toBe(displayNumber);
    expect(snapshot.lines).toHaveLength(1);
    expect(snapshot.totals.totalMinor).toBe("348000"); // jsonSafe stringifies bigint
    // the rendered document (slice-3 PDF/public view) builds from the
    // snapshot alone, so notes/terms freeze with it
    expect(snapshot.notes).toBe("Thank you!");
    expect(snapshot.terms).toBe("Net 30");
    expect(snapshot.paymentTermsDays).toBe(30);
    expect(issued!.paymentTermsDays).toBe(30);

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityId, invoiceId),
          eq(auditLog.action, "invoice.issued"),
        ),
      );
    expect(audit).toBeDefined();
  });

  it("assigns sequential display numbers from the org counter", async () => {
    const first = await createInvoiceDraft(db, actorInA(), draftInput());
    const second = await createInvoiceDraft(db, actorInA(), draftInput());
    const d1 = await getInvoice(db, fx.orgA, first.invoiceId);
    const d2 = await getInvoice(db, fx.orgA, second.invoiceId);
    const r1 = await issueInvoice(db, actorInA(), issueInput(first.invoiceId, d1!.version));
    const r2 = await issueInvoice(db, actorInA(), issueInput(second.invoiceId, d2!.version));
    const n = (s: string) => Number(s.split("-")[1]);
    expect(n(r2.displayNumber)).toBe(n(r1.displayNumber) + 1);
  });

  it("org B's counter is independent of org A's", async () => {
    const { invoiceId } = await createInvoiceDraft(db, actorInB(), {
      ...draftInput({ customerId: customerB }),
    });
    const draft = await getInvoice(db, fx.orgB, invoiceId);
    const { displayNumber } = await issueInvoice(
      db,
      actorInB(),
      issueInput(invoiceId, draft!.version),
    );
    expect(displayNumber).toBe("INV-000001");
  });

  it("an issued invoice is immutable: update, delete, and re-issue all fail", async () => {
    const { invoiceId } = await createInvoiceDraft(db, actorInA(), draftInput());
    const draft = await getInvoice(db, fx.orgA, invoiceId);
    await issueInvoice(db, actorInA(), issueInput(invoiceId, draft!.version));
    const issued = await getInvoice(db, fx.orgA, invoiceId);

    await expect(
      updateInvoiceDraft(db, actorInA(), {
        id: invoiceId,
        version: issued!.version,
        ...draftInput(),
      }),
    ).rejects.toThrow(ImmutableDocumentError);
    await expect(
      deleteInvoiceDraft(db, actorInA(), {
        id: invoiceId,
        version: issued!.version,
      }),
    ).rejects.toThrow(ImmutableDocumentError);
    await expect(
      issueInvoice(db, actorInA(), issueInput(invoiceId, issued!.version)),
    ).rejects.toThrow(ValidationError); // sent → sent is not a legal transition
  });

  it("the snapshot survives later customer edits (Layer 2)", async () => {
    const { customerId } = await createCustomer(db, actorInA(), {
      name: "Original Name Ltd",
    });
    const { invoiceId } = await createInvoiceDraft(
      db,
      actorInA(),
      draftInput({ customerId }),
    );
    const draft = await getInvoice(db, fx.orgA, invoiceId);
    await issueInvoice(db, actorInA(), issueInput(invoiceId, draft!.version));

    // rename the customer AFTER issue
    const { updateCustomer } = await import("@/lib/services/customers");
    const { getCustomer } = await import("@/lib/services/customers");
    const cust = await getCustomer(db, fx.orgA, customerId);
    await updateCustomer(db, actorInA(), {
      id: customerId,
      version: cust!.version,
      name: "Renamed After Issue Ltd",
    });

    const issued = await getInvoice(db, fx.orgA, invoiceId);
    const snapshot = issued!.snapshot as SnapshotShape;
    expect(snapshot.customer.name).toBe("Original Name Ltd");
  });

  it("issue requires an FX rate for foreign currency and rejects one for base", async () => {
    await upgradeToPro(db, fx.orgA);
    const { invoiceId } = await createInvoiceDraft(
      db,
      actorInA(),
      draftInput({ currency: "USD" }),
    );
    const draft = await getInvoice(db, fx.orgA, invoiceId);
    await expect(
      issueInvoice(db, actorInA(), issueInput(invoiceId, draft!.version)),
    ).rejects.toThrow(ValidationError);

    const { displayNumber } = await issueInvoice(db, actorInA(), {
      ...issueInput(invoiceId, draft!.version),
      fxRateToBase: "129.55",
    });
    expect(displayNumber).toBeTruthy();
    const issued = await getInvoice(db, fx.orgA, invoiceId);
    expect(issued!.fxRateToBase).toBe("129.55000000");
    expect((issued!.snapshot as SnapshotShape).fxRateToBase).toBe("129.55");

    // base-currency invoice must NOT take a rate
    const kes = await createInvoiceDraft(db, actorInA(), draftInput());
    const kesDraft = await getInvoice(db, fx.orgA, kes.invoiceId);
    await expect(
      issueInvoice(db, actorInA(), {
        ...issueInput(kes.invoiceId, kesDraft!.version),
        fxRateToBase: "1.00",
      }),
    ).rejects.toThrow(ValidationError);
    await setPlan(db, fx.orgA, "free");
  });

  it("rejects a due date before the issue date", async () => {
    const { invoiceId } = await createInvoiceDraft(db, actorInA(), draftInput());
    const draft = await getInvoice(db, fx.orgA, invoiceId);
    await expect(
      issueInvoice(db, actorInA(), {
        id: invoiceId,
        version: draft!.version,
        issueDate: "2026-07-06",
        dueDate: "2026-07-05",
      }),
    ).rejects.toThrow(ValidationError);
  });

  // -------------------------------------------------------------------------
  // void

  it("voids an issued invoice with a reason; drafts cannot be voided", async () => {
    const { invoiceId } = await createInvoiceDraft(db, actorInA(), draftInput());
    const draft = await getInvoice(db, fx.orgA, invoiceId);
    await expect(
      voidInvoice(db, actorInA(), { id: invoiceId, reason: "duplicate entry" }),
    ).rejects.toThrow(ValidationError);

    await issueInvoice(db, actorInA(), issueInput(invoiceId, draft!.version));
    await voidInvoice(db, actorInA(), {
      id: invoiceId,
      reason: "duplicate entry",
    });
    const voided = await getInvoice(db, fx.orgA, invoiceId);
    expect(voided!.status).toBe("void");
    // the document itself is untouched by the annulment
    expect(voided!.displayNumber).not.toBeNull();
    expect(voided!.snapshot).not.toBeNull();

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityId, invoiceId),
          eq(auditLog.action, "invoice.voided"),
        ),
      );
    expect(audit.reason).toBe("duplicate entry");

    // void is terminal
    await expect(
      voidInvoice(db, actorInA(), { id: invoiceId, reason: "again" }),
    ).rejects.toThrow(ValidationError);
  });

  it("a non-member of the org cannot void its invoices", async () => {
    // alice is owner of org A; bob is not a member of org A at all
    const { invoiceId } = await createInvoiceDraft(db, actorInA(), draftInput());
    await expect(
      voidInvoice(db, bobInA(), { id: invoiceId, reason: "not my org" }),
    ).rejects.toThrow(PermissionError); // membership check fails first
  });

  // -------------------------------------------------------------------------
  // tenant isolation

  it("org B cannot read, update, issue, or void org A's invoice", async () => {
    const { invoiceId } = await createInvoiceDraft(db, actorInA(), draftInput());
    const draft = await getInvoice(db, fx.orgA, invoiceId);

    expect(await getInvoice(db, fx.orgB, invoiceId)).toBeNull();
    await expect(
      updateInvoiceDraft(db, actorInB(), {
        id: invoiceId,
        version: draft!.version,
        ...draftInput({ customerId: customerB }),
      }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      issueInvoice(db, actorInB(), issueInput(invoiceId, draft!.version)),
    ).rejects.toThrow(NotFoundError);
    await expect(
      voidInvoice(db, actorInB(), { id: invoiceId, reason: "cross-tenant" }),
    ).rejects.toThrow(NotFoundError);

    const listB = await listInvoices(db, fx.orgB);
    expect(listB.find((i) => i.id === invoiceId)).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // free-tier monthly cap

  it("enforces the monthly issue cap on the free plan", async () => {
    const already = await issuedThisMonth(db, fx.orgA);
    // issue up to the cap of 20
    for (let i = already; i < 20; i++) {
      const { invoiceId } = await createInvoiceDraft(db, actorInA(), draftInput());
      const d = await getInvoice(db, fx.orgA, invoiceId);
      await issueInvoice(db, actorInA(), issueInput(invoiceId, d!.version));
    }
    const { invoiceId } = await createInvoiceDraft(db, actorInA(), draftInput());
    const d = await getInvoice(db, fx.orgA, invoiceId);
    await expect(
      issueInvoice(db, actorInA(), issueInput(invoiceId, d!.version)),
    ).rejects.toThrow(EntitlementError);
    // pro lifts the cap
    await upgradeToPro(db, fx.orgA);
    await expect(
      issueInvoice(db, actorInA(), issueInput(invoiceId, d!.version)),
    ).resolves.toBeTruthy();
    await setPlan(db, fx.orgA, "free");
  });

  // -------------------------------------------------------------------------
  // reads

  it("list filters by status, customer, and search", async () => {
    const all = await listInvoices(db, fx.orgA);
    expect(all.length).toBeGreaterThan(0);
    const drafts = await listInvoices(db, fx.orgA, { status: "draft" });
    expect(drafts.every((i) => i.status === "draft")).toBe(true);
    const byCustomer = await listInvoices(db, fx.orgA, { customerId: customerA });
    expect(byCustomer.every((i) => i.customerId === customerA)).toBe(true);
    const byNumber = await listInvoices(db, fx.orgA, { q: "INV-0000" });
    expect(byNumber.length).toBeGreaterThan(0);
    const byName = await listInvoices(db, fx.orgA, { q: "acme" });
    expect(byName.length).toBeGreaterThan(0);
  });

  it("timeline reads back the invoice's audit history", async () => {
    const { invoiceId } = await createInvoiceDraft(db, actorInA(), draftInput());
    const d = await getInvoice(db, fx.orgA, invoiceId);
    await updateInvoiceDraft(db, actorInA(), {
      id: invoiceId,
      version: d!.version,
      ...draftInput(),
    });
    const timeline = await getInvoiceTimeline(db, fx.orgA, invoiceId);
    const actions = timeline.map((t) => t.action);
    expect(actions).toContain("invoice.created");
    expect(actions).toContain("invoice.updated");
  });
});

describe("settings service (tax rates + numbering)", () => {
  let db: Database;
  let fx: TwoOrgFixture;

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

  beforeAll(async () => {
    ({ db } = await createTestDb());
    fx = await createTwoOrgFixture(db);
  });

  it("creates, updates, and soft-deletes tax rates with audit + versions", async () => {
    const { taxRateId } = await createTaxRate(db, actorInA(), {
      name: "VAT",
      rateBps: 1600,
    });
    let rates = await listTaxRates(db, fx.orgA);
    expect(rates.map((r) => r.name)).toContain("VAT");

    const vat = rates.find((r) => r.id === taxRateId)!;
    await updateTaxRate(db, actorInA(), {
      id: taxRateId,
      version: vat.version,
      name: "VAT (standard)",
      rateBps: 1600,
    });
    rates = await listTaxRates(db, fx.orgA);
    expect(rates.find((r) => r.id === taxRateId)!.name).toBe("VAT (standard)");

    // isolation: org B neither sees nor touches org A's rate
    expect(
      (await listTaxRates(db, fx.orgB)).find((r) => r.id === taxRateId),
    ).toBeUndefined();
    await expect(
      updateTaxRate(db, actorInB(), {
        id: taxRateId,
        version: vat.version + 1,
        name: "hijack",
        rateBps: 0,
      }),
    ).rejects.toThrow(NotFoundError);

    const updated = (await listTaxRates(db, fx.orgA)).find(
      (r) => r.id === taxRateId,
    )!;
    await deleteTaxRate(db, actorInA(), {
      id: taxRateId,
      version: updated.version,
    });
    expect(
      (await listTaxRates(db, fx.orgA)).find((r) => r.id === taxRateId),
    ).toBeUndefined();

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, taxRateId));
    expect(audits.map((a) => a.action).sort()).toEqual([
      "tax_rate.created",
      "tax_rate.deleted",
      "tax_rate.updated",
    ]);
  });

  it("numbering: prefix updates, counter never moves backwards", async () => {
    const before = await getInvoiceSettings(db, fx.orgA);
    await updateInvoiceNumbering(db, actorInA(), {
      version: before.version,
      invoicePrefix: "ACME",
      invoiceNextNumber: before.invoiceNextNumber + 10,
    });
    const after = await getInvoiceSettings(db, fx.orgA);
    expect(after.invoicePrefix).toBe("ACME");
    expect(after.invoiceNextNumber).toBe(before.invoiceNextNumber + 10);

    await expect(
      updateInvoiceNumbering(db, actorInA(), {
        version: after.version,
        invoicePrefix: "ACME",
        invoiceNextNumber: after.invoiceNextNumber - 1,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("payment-terms default and invoice defaults persist with audit", async () => {
    let settings = await getInvoiceSettings(db, fx.orgA);
    await updatePaymentTermsDefault(db, actorInA(), {
      version: settings.version,
      defaultPaymentTermsDays: 14,
    });
    settings = await getInvoiceSettings(db, fx.orgA);
    expect(settings.defaultPaymentTermsDays).toBe(14);

    const { taxRateId } = await createTaxRate(db, actorInA(), {
      name: "VAT",
      rateBps: 1600,
    });
    settings = await getInvoiceSettings(db, fx.orgA);
    await updateInvoiceDefaults(db, actorInA(), {
      version: settings.version,
      defaultTaxRateId: taxRateId,
      defaultInvoiceNotes: "Asante sana!",
      defaultInvoiceTerms: "Payment due per stated terms.",
    });
    settings = await getInvoiceSettings(db, fx.orgA);
    expect(settings.defaultTaxRateId).toBe(taxRateId);
    expect(settings.defaultInvoiceNotes).toBe("Asante sana!");
    expect(settings.defaultInvoiceTerms).toBe("Payment due per stated terms.");

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "settings.updated"));
    expect(audits.length).toBeGreaterThanOrEqual(2);

    // deleting the default tax rate clears the pointer (existing behavior)
    const rate = (await listTaxRates(db, fx.orgA)).find((r) => r.id === taxRateId)!;
    await deleteTaxRate(db, actorInA(), { id: taxRateId, version: rate.version });
    settings = await getInvoiceSettings(db, fx.orgA);
    expect(settings.defaultTaxRateId).toBeNull();
  });

  it("estimate/credit-note counters: prefix updates, forward-only", async () => {
    let settings = await getInvoiceSettings(db, fx.orgA);
    await updateDocNumbering(db, actorInA(), {
      version: settings.version,
      doc: "estimate",
      prefix: "QT",
      nextNumber: settings.estimateNextNumber + 5,
    });
    settings = await getInvoiceSettings(db, fx.orgA);
    expect(settings.estimatePrefix).toBe("QT");
    await expect(
      updateDocNumbering(db, actorInA(), {
        version: settings.version,
        doc: "estimate",
        prefix: "QT",
        nextNumber: settings.estimateNextNumber - 1,
      }),
    ).rejects.toThrow(ValidationError);
    // bump the CN counter first so "backwards" is a real number (not a
    // Zod min(1) rejection)
    await updateDocNumbering(db, actorInA(), {
      version: settings.version,
      doc: "credit_note",
      prefix: "CR",
      nextNumber: settings.creditNoteNextNumber + 3,
    });
    settings = await getInvoiceSettings(db, fx.orgA);
    await expect(
      updateDocNumbering(db, actorInA(), {
        version: settings.version,
        doc: "credit_note",
        prefix: "CR",
        nextNumber: settings.creditNoteNextNumber - 1,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("renames the organization with an audit trail; viewers cannot", async () => {
    await updateOrganizationName(db, actorInA(), { name: "Acme Studios" });
    const [audit] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "organization.updated"));
    expect(audit).toBeDefined();
    expect(audit.organizationId).toBe(fx.orgA);

    await expect(
      updateOrganizationName(db, actorInB(), { name: "x" }),
    ).rejects.toThrow(ValidationError); // too short, rejected before anything else
    await expect(
      updateOrganizationName(
        db,
        { actorType: "user", actorId: fx.bob.id, organizationId: fx.orgA },
        { name: "Hostile Takeover Ltd" },
      ),
    ).rejects.toThrow(PermissionError); // bob is not a member of org A
  });
});
