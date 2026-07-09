import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import {
  ConflictError,
  ImmutableDocumentError,
  NotFoundError,
  ValidationError,
} from "@/lib/domain/errors";
import type { ActorContext } from "@/lib/audit/context";
import {
  convertEstimateToInvoice,
  createEstimateDraft,
  deleteEstimateDraft,
  getEstimate,
  getEstimateByPublicToken,
  issueEstimate,
  listEstimateEmails,
  listEstimates,
  recordEstimateDecision,
  recordEstimateView,
  recordPublicEstimateDecision,
  sendEstimate,
  updateEstimateDraft,
} from "@/lib/services/estimates";
import type { EmailMessage } from "@/lib/email/port";
import { getInvoice, issueInvoice } from "@/lib/services/invoices";
import { createCustomer } from "@/lib/services/customers";
import { createTestDb } from "../helpers/db";
import { createTwoOrgFixture, type TwoOrgFixture } from "../helpers/fixtures";

describe("estimates (slice 6)", () => {
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

  const draftInput = (overrides: Record<string, unknown> = {}) => ({
    customerId: customerA,
    currency: "KES" as const,
    lines: [
      {
        description: "Website design",
        quantity: "1",
        unitPrice: "2500.00",
        discountBps: 0,
        taxRateBps: 1600,
      },
    ],
    ...overrides,
  });

  async function issued(): Promise<string> {
    const { estimateId } = await createEstimateDraft(db, actorInA(), draftInput());
    const draft = await getEstimate(db, fx.orgA, estimateId);
    await issueEstimate(db, actorInA(), {
      id: estimateId,
      version: draft!.version,
      issueDate: "2026-07-08",
      expiryDate: "2026-08-07",
    });
    return estimateId;
  }

  beforeAll(async () => {
    ({ db } = await createTestDb());
    fx = await createTwoOrgFixture(db);
    customerA = (await createCustomer(db, actorInA(), { name: "Acme Ltd" }))
      .customerId;
  });

  it("draft lifecycle: create with totals, update, delete — audited", async () => {
    const { estimateId } = await createEstimateDraft(db, actorInA(), draftInput());
    let est = await getEstimate(db, fx.orgA, estimateId);
    // 2,500 + 16% VAT = 2,900.00
    expect(est!.totalMinor).toBe(290_000n);
    expect(est!.status).toBe("draft");
    expect(est!.displayNumber).toBeNull();

    await updateEstimateDraft(db, actorInA(), {
      id: estimateId,
      version: est!.version,
      ...draftInput({
        lines: [
          {
            description: "Design + hosting",
            quantity: "1",
            unitPrice: "3000.00",
            discountBps: 0,
            taxRateBps: 0,
          },
        ],
      }),
    });
    est = await getEstimate(db, fx.orgA, estimateId);
    expect(est!.totalMinor).toBe(300_000n);

    await deleteEstimateDraft(db, actorInA(), {
      id: estimateId,
      version: est!.version,
    });
    expect(await getEstimate(db, fx.orgA, estimateId)).toBeNull();
  });

  it("issue assigns EST numbers from an independent counter and freezes a snapshot", async () => {
    const id = await issued();
    const est = await getEstimate(db, fx.orgA, id);
    expect(est!.displayNumber).toMatch(/^EST-\d{6}$/);
    expect(est!.status).toBe("sent");
    expect(est!.publicToken).toBeTruthy();
    const snapshot = est!.snapshot as { displayNumber: string; docType: string };
    expect(snapshot.docType).toBe("estimate");
    expect(snapshot.displayNumber).toBe(est!.displayNumber);

    // issued estimates are immutable
    await expect(
      updateEstimateDraft(db, actorInA(), {
        id,
        version: est!.version,
        ...draftInput(),
      }),
    ).rejects.toThrow(ImmutableDocumentError);
    await expect(
      deleteEstimateDraft(db, actorInA(), { id, version: est!.version }),
    ).rejects.toThrow(ImmutableDocumentError);

    // public token resolves; drafts don't have one
    const found = await getEstimateByPublicToken(db, est!.publicToken!);
    expect(found).not.toBeNull();
    expect(found!.status).toBe("sent");
  });

  it("decisions follow the machine; a late yes after declined/expired is allowed", async () => {
    const id = await issued();
    await recordEstimateDecision(db, actorInA(), { id, decision: "declined" });
    expect((await getEstimate(db, fx.orgA, id))!.status).toBe("declined");
    await recordEstimateDecision(db, actorInA(), { id, decision: "accepted" });
    expect((await getEstimate(db, fx.orgA, id))!.status).toBe("accepted");
    // accepted cannot "expire"
    await expect(
      recordEstimateDecision(db, actorInA(), { id, decision: "expired" }),
    ).rejects.toThrow(ValidationError);
  });

  it("conversion: accepted → linked invoice DRAFT, lines copied, both audited, terminal", async () => {
    const id = await issued();
    // cannot convert before acceptance
    const est = await getEstimate(db, fx.orgA, id);
    await expect(
      convertEstimateToInvoice(db, actorInA(), { id, version: est!.version }),
    ).rejects.toThrow(ValidationError);

    await recordEstimateDecision(db, actorInA(), { id, decision: "accepted" });
    const accepted = await getEstimate(db, fx.orgA, id);
    const { invoiceId } = await convertEstimateToInvoice(db, actorInA(), {
      id,
      version: accepted!.version,
    });

    const converted = await getEstimate(db, fx.orgA, id);
    expect(converted!.status).toBe("converted");
    expect(converted!.convertedInvoiceId).toBe(invoiceId); // exit criterion: linked

    const invoice = await getInvoice(db, fx.orgA, invoiceId);
    expect(invoice!.status).toBe("draft"); // owner reviews before issuing
    expect(invoice!.totalMinor).toBe(converted!.totalMinor);
    expect(invoice!.lines).toHaveLength(1);
    expect(invoice!.lines[0].description).toBe("Website design");

    // the invoice issues through its own flow with an INV number
    const { displayNumber } = await issueInvoice(db, actorInA(), {
      id: invoiceId,
      version: invoice!.version,
      issueDate: "2026-07-08",
      dueDate: "2026-08-07",
    });
    expect(displayNumber).toMatch(/^INV-/);

    // audits landed on BOTH documents
    const estAudits = await db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.entityId, id), eq(auditLog.action, "estimate.converted")),
      );
    expect(estAudits).toHaveLength(1);
    const invAudits = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityId, invoiceId),
          eq(auditLog.action, "invoice.created"),
        ),
      );
    expect(invAudits).toHaveLength(1);

    // converted is terminal — no second conversion, no decision flips
    await expect(
      convertEstimateToInvoice(db, actorInA(), {
        id,
        version: converted!.version,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("org B cannot read, update, issue, decide, or convert org A's estimate", async () => {
    const id = await issued();
    const est = await getEstimate(db, fx.orgA, id);
    expect(await getEstimate(db, fx.orgB, id)).toBeNull();
    await expect(
      updateEstimateDraft(db, actorInB(), {
        id,
        version: est!.version,
        ...draftInput(),
      }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      recordEstimateDecision(db, actorInB(), { id, decision: "accepted" }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      convertEstimateToInvoice(db, actorInB(), { id, version: est!.version }),
    ).rejects.toThrow(NotFoundError);
    expect(
      (await listEstimates(db, fx.orgB)).find((e) => e.id === id),
    ).toBeUndefined();
  });

  it("stale version conflicts are rejected", async () => {
    const { estimateId } = await createEstimateDraft(db, actorInA(), draftInput());
    const est = await getEstimate(db, fx.orgA, estimateId);
    await updateEstimateDraft(db, actorInA(), {
      id: estimateId,
      version: est!.version,
      ...draftInput(),
    });
    await expect(
      updateEstimateDraft(db, actorInA(), {
        id: estimateId,
        version: est!.version, // stale
        ...draftInput(),
      }),
    ).rejects.toThrow(ConflictError);
  });
});


describe("estimate public lifecycle + send (Zoho-style)", () => {
  let db: Database;
  let fx: TwoOrgFixture;
  let customerA: string;
  let contactId: string;

  const actorInA = (): ActorContext => ({
    actorType: "user",
    actorId: fx.alice.id,
    organizationId: fx.orgA,
  });

  const draftInput = () => ({
    customerId: customerA,
    currency: "KES" as const,
    lines: [
      { description: "Design", quantity: "1", unitPrice: "2500.00", discountBps: 0, taxRateBps: 0 },
    ],
  });

  async function issued(
    expiry = "2099-08-07",
    issueDate = "2026-07-08",
  ): Promise<string> {
    const { estimateId } = await createEstimateDraft(db, actorInA(), draftInput());
    const draft = await getEstimate(db, fx.orgA, estimateId);
    await issueEstimate(db, actorInA(), {
      id: estimateId,
      version: draft!.version,
      issueDate,
      expiryDate: expiry,
    });
    return estimateId;
  }

  function fakeSender() {
    const sent: EmailMessage[] = [];
    return {
      sent,
      sender: {
        async send(message: EmailMessage) {
          sent.push(message);
          return { providerMessageId: `fake-${sent.length}` };
        },
      },
    };
  }

  beforeAll(async () => {
    ({ db } = await createTestDb());
    fx = await createTwoOrgFixture(db);
    const c = await createCustomer(db, actorInA(), {
      name: "Acme Ltd",
      primaryContact: {
        firstName: "Grace",
        lastName: "Wanjiku",
        email: "grace@acme.test",
      },
    });
    customerA = c.customerId;
    const { listContacts } = await import("@/lib/services/contacts");
    contactId = (await listContacts(db, fx.orgA, customerA))[0].id;
  });

  it("recordEstimateView marks a sent quote viewed, then is a no-op", async () => {
    const id = await issued();
    const token = (await getEstimate(db, fx.orgA, id))!.publicToken!;
    await recordEstimateView(db, token);
    expect((await getEstimate(db, fx.orgA, id))!.status).toBe("viewed");
    // idempotent — a second view does not change or error
    await recordEstimateView(db, token);
    expect((await getEstimate(db, fx.orgA, id))!.status).toBe("viewed");

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.entityId, id), eq(auditLog.action, "estimate.viewed")),
      );
    expect(audit.actorType).toBe("customer");
    expect(audit.actorId).toBeNull();
  });

  it("a decided quote is not reverted by a later view", async () => {
    const id = await issued();
    const token = (await getEstimate(db, fx.orgA, id))!.publicToken!;
    await recordPublicEstimateDecision(db, token, "accepted");
    await recordEstimateView(db, token);
    expect((await getEstimate(db, fx.orgA, id))!.status).toBe("accepted");
  });

  it("public accept/decline via token; second response and bad token rejected", async () => {
    const id = await issued();
    const token = (await getEstimate(db, fx.orgA, id))!.publicToken!;
    const { sent, sender } = fakeSender();
    const res = await recordPublicEstimateDecision(db, token, "declined", undefined, {
      emailSender: sender,
      baseUrl: "https://app.example",
    });
    expect(res.status).toBe("declined");
    const [audit] = await db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.entityId, id), eq(auditLog.action, "estimate.declined")),
      );
    expect(audit.actorType).toBe("customer");
    expect(audit.reason).toBe("via public link");

    // the org is notified (owner email, no branding contact set) with a
    // logged email_messages row of type estimate_response
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain("declined");
    expect(sent[0].text).toContain("https://app.example/orgs/");
    const log = await listEstimateEmails(db, fx.orgA, id);
    expect(log.some((e) => e.status === "sent")).toBe(true);

    // already responded → rejected (declined is not awaiting a decision)
    await expect(
      recordPublicEstimateDecision(db, token, "accepted"),
    ).rejects.toThrow(/already been responded/);
    await expect(
      recordPublicEstimateDecision(db, "not-a-real-token-xxxxxx", "accepted"),
    ).rejects.toThrow(NotFoundError);
  });

  it("public accept is refused after the valid-until date", async () => {
    const id = await issued("2026-06-15", "2026-06-01"); // both past
    const token = (await getEstimate(db, fx.orgA, id))!.publicToken!;
    await expect(
      recordPublicEstimateDecision(db, token, "accepted"),
    ).rejects.toThrow(/expired/);
    // but declining an expired quote is still fine
    const res = await recordPublicEstimateDecision(db, token, "declined");
    expect(res.status).toBe("declined");
  });

  it("sendEstimate emails contacts with a log row + audit; draft cannot send", async () => {
    const { estimateId } = await createEstimateDraft(db, actorInA(), draftInput());
    const { sender } = fakeSender();
    await expect(
      sendEstimate(db, actorInA(), { id: estimateId, contactIds: [contactId] }, { emailSender: sender }),
    ).rejects.toThrow(/Issue the estimate/);

    const id = await issued();
    const { sent, sender: sender2 } = fakeSender();
    const { recipients } = await sendEstimate(
      db,
      actorInA(),
      { id, contactIds: [contactId] },
      { emailSender: sender2, baseUrl: "https://app.example" },
    );
    expect(recipients).toEqual(["grace@acme.test"]);
    expect(sent[0].to).toBe("grace@acme.test");
    expect(sent[0].text).toContain("https://app.example/e/");
    const log = await listEstimateEmails(db, fx.orgA, id);
    expect(log).toHaveLength(1);
    expect(log[0].status).toBe("sent");
  });
});
