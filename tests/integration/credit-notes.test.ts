import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import {
  ImmutableDocumentError,
  NotFoundError,
  ValidationError,
} from "@/lib/domain/errors";
import type { ActorContext } from "@/lib/audit/context";
import {
  createCreditNote,
  deleteCreditNote,
  getCreditNote,
  issueCreditNote,
  issuedCreditsForInvoice,
  listCreditNotes,
  updateCreditNote,
  voidCreditNote,
} from "@/lib/services/credit-notes";
import {
  createInvoiceDraft,
  getInvoice,
  issueInvoice,
} from "@/lib/services/invoices";
import { recordPayment } from "@/lib/services/payments";
import { getFinancialOverview } from "@/lib/services/reporting";
import { createCustomer } from "@/lib/services/customers";
import { createTestDb } from "../helpers/db";
import { setPlan, upgradeToPro } from "../helpers/fixtures";
import { createTwoOrgFixture, type TwoOrgFixture } from "../helpers/fixtures";

describe("credit notes (slice 6)", () => {
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

  async function issuedInvoice(amount = "1000.00"): Promise<string> {
    const { invoiceId } = await createInvoiceDraft(db, actorInA(), {
      customerId: customerA,
      currency: "KES",
      lines: [
        {
          description: "Work",
          quantity: "1",
          unitPrice: amount,
          discountBps: 0,
          taxRateBps: 0,
        },
      ],
    });
    const draft = await getInvoice(db, fx.orgA, invoiceId);
    await issueInvoice(db, actorInA(), {
      id: invoiceId,
      version: draft!.version,
      issueDate: "2026-07-08",
      dueDate: "2026-08-07",
    });
    return invoiceId;
  }

  const cnLines = (amount: string) => [
    { description: "Correction", quantity: "1", unitPrice: amount, taxRateBps: 0 },
  ];

  beforeAll(async () => {
    ({ db } = await createTestDb());
    fx = await createTwoOrgFixture(db);
    customerA = (await createCustomer(db, actorInA(), { name: "Acme Ltd" }))
      .customerId;
  });

  it("full lifecycle: draft → CN number + snapshot → immutable; both timelines audited", async () => {
    const invoiceId = await issuedInvoice();
    const { creditNoteId } = await createCreditNote(db, actorInA(), {
      invoiceId,
      reason: "over-billed hours",
      lines: cnLines("200.00"),
    });
    let cn = await getCreditNote(db, fx.orgA, creditNoteId);
    expect(cn!.status).toBe("draft");
    expect(cn!.totalMinor).toBe(20_000n);
    expect(cn!.currency).toBe("KES"); // inherited from the invoice

    await updateCreditNote(db, actorInA(), {
      id: creditNoteId,
      version: cn!.version,
      reason: "over-billed hours",
      lines: cnLines("250.00"),
    });
    cn = await getCreditNote(db, fx.orgA, creditNoteId);
    expect(cn!.totalMinor).toBe(25_000n);

    const { displayNumber } = await issueCreditNote(db, actorInA(), {
      id: creditNoteId,
      version: cn!.version,
      issueDate: "2026-07-08",
    });
    expect(displayNumber).toMatch(/^CN-\d{6}$/);
    cn = await getCreditNote(db, fx.orgA, creditNoteId);
    expect(cn!.status).toBe("issued");
    const snapshot = cn!.snapshot as {
      docType: string;
      invoice: { displayNumber: string };
    };
    expect(snapshot.docType).toBe("credit_note");
    expect(snapshot.invoice.displayNumber).toMatch(/^INV-/);

    // issued credit notes are immutable
    await expect(
      updateCreditNote(db, actorInA(), {
        id: creditNoteId,
        version: cn!.version,
        lines: cnLines("10.00"),
      }),
    ).rejects.toThrow(ImmutableDocumentError);
    await expect(
      deleteCreditNote(db, actorInA(), { id: creditNoteId, version: cn!.version }),
    ).rejects.toThrow(ImmutableDocumentError);

    // audit rows on BOTH the credit note and the invoice
    const cnAudit = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityId, creditNoteId),
          eq(auditLog.action, "credit_note.issued"),
        ),
      );
    expect(cnAudit).toHaveLength(1);
    const invAudit = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityId, invoiceId),
          eq(auditLog.action, "invoice.credited"),
        ),
      );
    expect(invAudit).toHaveLength(1);
  });

  it("credits cannot exceed the invoice total, cumulatively; void restores headroom", async () => {
    const invoiceId = await issuedInvoice("1000.00");
    // first credit: 700
    const first = await createCreditNote(db, actorInA(), {
      invoiceId,
      lines: cnLines("700.00"),
    });
    let cn1 = await getCreditNote(db, fx.orgA, first.creditNoteId);
    await issueCreditNote(db, actorInA(), {
      id: first.creditNoteId,
      version: cn1!.version,
      issueDate: "2026-07-08",
    });

    // a second 700 exceeds the remaining 300 headroom — rejected at create
    await expect(
      createCreditNote(db, actorInA(), { invoiceId, lines: cnLines("700.00") }),
    ).rejects.toThrow(/Credit exceeds/);

    // a 300 credit drafts fine; if headroom shrinks before issue it re-checks
    const second = await createCreditNote(db, actorInA(), {
      invoiceId,
      lines: cnLines("300.00"),
    });
    const cn2 = await getCreditNote(db, fx.orgA, second.creditNoteId);
    await issueCreditNote(db, actorInA(), {
      id: second.creditNoteId,
      version: cn2!.version,
      issueDate: "2026-07-08",
    });
    const credited = await issuedCreditsForInvoice(db, fx.orgA, invoiceId, "KES");
    expect(credited.amountMinor).toBe(100_000n); // fully credited

    // voiding the second restores headroom
    await voidCreditNote(db, actorInA(), {
      id: second.creditNoteId,
      reason: "issued in error",
    });
    const afterVoid = await issuedCreditsForInvoice(db, fx.orgA, invoiceId, "KES");
    expect(afterVoid.amountMinor).toBe(70_000n);
    // void is terminal
    cn1 = await getCreditNote(db, fx.orgA, second.creditNoteId);
    await expect(
      voidCreditNote(db, actorInA(), { id: second.creditNoteId, reason: "again" }),
    ).rejects.toThrow(ValidationError);
  });

  it("EXIT CRITERION: credited invoices report the correct effective balance", async () => {
    const before = await getFinancialOverview(db, fx.orgA);

    const invoiceId = await issuedInvoice("1000.00"); // +1,000 outstanding
    await recordPayment(db, actorInA(), {
      invoiceId,
      amount: "300.00",
      currency: "KES",
      method: "mpesa",
      paidAt: "2026-07-08",
    }); // 700 remaining in cash terms

    const { creditNoteId } = await createCreditNote(db, actorInA(), {
      invoiceId,
      lines: cnLines("500.00"),
    });
    const cn = await getCreditNote(db, fx.orgA, creditNoteId);
    // a DRAFT credit changes nothing
    let overview = await getFinancialOverview(db, fx.orgA);
    expect(overview.outstanding.amountMinor - before.outstanding.amountMinor).toBe(
      70_000n,
    );

    await issueCreditNote(db, actorInA(), {
      id: creditNoteId,
      version: cn!.version,
      issueDate: "2026-07-08",
    });
    // effective balance: 1,000 − 300 cash − 500 credit = 200
    overview = await getFinancialOverview(db, fx.orgA);
    expect(overview.outstanding.amountMinor - before.outstanding.amountMinor).toBe(
      20_000n,
    );
  });

  it("an issued CN inherits the invoice's FX rate; voided invoices reject issue under lock", async () => {
    await upgradeToPro(db, fx.orgA);
    // USD invoice with a rate
    const { invoiceId } = await createInvoiceDraft(db, actorInA(), {
      customerId: customerA,
      currency: "USD",
      lines: [
        { description: "W", quantity: "1", unitPrice: "100.00", discountBps: 0, taxRateBps: 0 },
      ],
    });
    const draft = await getInvoice(db, fx.orgA, invoiceId);
    await issueInvoice(db, actorInA(), {
      id: invoiceId,
      version: draft!.version,
      issueDate: "2026-07-08",
      dueDate: "2026-08-07",
      fxRateToBase: "129.55",
    });
    const { creditNoteId } = await createCreditNote(db, actorInA(), {
      invoiceId,
      lines: cnLines("40.00"),
    });
    const cn = await getCreditNote(db, fx.orgA, creditNoteId);
    await issueCreditNote(db, actorInA(), {
      id: creditNoteId,
      version: cn!.version,
      issueDate: "2026-07-08",
    });
    const issued = await getCreditNote(db, fx.orgA, creditNoteId);
    expect(issued!.fxRateToBase).toBe("129.55000000"); // same rate as its invoice
    await setPlan(db, fx.orgA, "free");

    // verifier MAJOR-2 regression: a draft CN cannot issue after its
    // invoice is voided
    const kesInvoice = await issuedInvoice("300.00");
    const { creditNoteId: cn2 } = await createCreditNote(db, actorInA(), {
      invoiceId: kesInvoice,
      lines: cnLines("100.00"),
    });
    const { voidInvoice } = await import("@/lib/services/invoices");
    await voidInvoice(db, actorInA(), { id: kesInvoice, reason: "cancelled job" });
    const cn2Row = await getCreditNote(db, fx.orgA, cn2);
    await expect(
      issueCreditNote(db, actorInA(), {
        id: cn2,
        version: cn2Row!.version,
        issueDate: "2026-07-08",
      }),
    ).rejects.toThrow(/no longer be credited/);
  });

  it("drafted/void invoices cannot be credited; org B is isolated", async () => {
    const { invoiceId: draftId } = await createInvoiceDraft(db, actorInA(), {
      customerId: customerA,
      currency: "KES",
      lines: [
        { description: "W", quantity: "1", unitPrice: "10.00", discountBps: 0, taxRateBps: 0 },
      ],
    });
    await expect(
      createCreditNote(db, actorInA(), { invoiceId: draftId, lines: cnLines("5.00") }),
    ).rejects.toThrow(/ISSUED invoices/);

    const invoiceId = await issuedInvoice("100.00");
    await expect(
      createCreditNote(db, actorInB(), { invoiceId, lines: cnLines("50.00") }),
    ).rejects.toThrow(NotFoundError);
    expect(
      (await listCreditNotes(db, fx.orgB)).find((c) => c.invoiceId === invoiceId),
    ).toBeUndefined();
  });
});
