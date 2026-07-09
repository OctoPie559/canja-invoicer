import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { auditLog, emailMessages, member, user } from "@/lib/db/schema";
import { newId } from "@/lib/domain/ids";
import { NotFoundError, PermissionError } from "@/lib/domain/errors";
import type { ActorContext } from "@/lib/audit/context";
import type { EmailMessage } from "@/lib/email/port";
import {
  createInvoiceDraft,
  getInvoice,
  getInvoiceByPublicToken,
  getInvoicePdfData,
  issueInvoice,
  listInvoiceEmails,
  sendInvoice,
  sendInvoiceReminder,
  voidInvoice,
} from "@/lib/services/invoices";
import { createCustomer, updateCustomer, getCustomer } from "@/lib/services/customers";
import { listContacts } from "@/lib/services/contacts";
import { recordPayment } from "@/lib/services/payments";
import { createTestDb } from "../helpers/db";
import { createTwoOrgFixture, type TwoOrgFixture } from "../helpers/fixtures";

/** Capturing fake sender: sends succeed without any network. */
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

describe("invoice send + public view (slice 3)", () => {
  let db: Database;
  let fx: TwoOrgFixture;
  let customerA: string;
  let contactId: string;

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

  const draftInput = () => ({
    customerId: customerA,
    currency: "KES" as const,
    lines: [
      {
        description: "Consulting",
        quantity: "1",
        unitPrice: "1000.00",
        discountBps: 0,
        taxRateBps: 1600,
      },
    ],
  });

  async function issuedInvoice(): Promise<string> {
    const { invoiceId } = await createInvoiceDraft(db, actorInA(), draftInput());
    const draft = await getInvoice(db, fx.orgA, invoiceId);
    await issueInvoice(db, actorInA(), {
      id: invoiceId,
      version: draft!.version,
      issueDate: "2026-07-07",
      dueDate: "2026-08-06",
    });
    return invoiceId;
  }

  beforeAll(async () => {
    ({ db } = await createTestDb());
    fx = await createTwoOrgFixture(db);
    const a = await createCustomer(db, actorInA(), {
      name: "Acme Ltd",
      primaryContact: {
        firstName: "Grace",
        lastName: "Wanjiku",
        email: "grace@acme.test",
      },
    });
    customerA = a.customerId;
    const contacts = await listContacts(db, fx.orgA, customerA);
    contactId = contacts[0].id;
  });

  it("sends to a customer contact: log rows, audit, provider id", async () => {
    const invoiceId = await issuedInvoice();
    const { sent, sender } = fakeSender();
    const { recipients } = await sendInvoice(
      db,
      actorInA(),
      { id: invoiceId, contactIds: [contactId] },
      { emailSender: sender, baseUrl: "https://app.example" },
    );
    expect(recipients).toEqual(["grace@acme.test"]);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("grace@acme.test");
    expect(sent[0].subject).toContain("Invoice INV-");
    expect(sent[0].text).toContain("https://app.example/i/");

    const log = await listInvoiceEmails(db, fx.orgA, invoiceId);
    expect(log).toHaveLength(1);
    expect(log[0].status).toBe("sent");

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.entityId, invoiceId), eq(auditLog.action, "invoice.sent")),
      );
    expect(audit).toBeDefined();
  });

  it("drafts and voided invoices cannot be sent", async () => {
    const { invoiceId } = await createInvoiceDraft(db, actorInA(), draftInput());
    const { sender } = fakeSender();
    await expect(
      sendInvoice(db, actorInA(), { id: invoiceId, contactIds: [contactId] }, { emailSender: sender }),
    ).rejects.toThrow(/Issue the invoice/);

    const voidedId = await issuedInvoice();
    await voidInvoice(db, actorInA(), { id: voidedId, reason: "test void" });
    await expect(
      sendInvoice(db, actorInA(), { id: voidedId, contactIds: [contactId] }, { emailSender: sender }),
    ).rejects.toThrow(/void invoice/);
  });

  it("an unverified sender is gated (sending-domain reputation)", async () => {
    // membership seeded directly: this negative test needs a member whose
    // ACCOUNT is unverified, which the service-level fixtures cannot make
    const unverified = newId();
    await db.insert(user).values({
      id: unverified,
      name: "unverified",
      email: `u-${unverified.slice(-6)}@example.test`,
      emailVerified: false,
    });
    await db.insert(member).values({
      id: newId(),
      organizationId: fx.orgA,
      userId: unverified,
      role: "member",
    });
    const invoiceId = await issuedInvoice();
    const { sender } = fakeSender();
    await expect(
      sendInvoice(
        db,
        { actorType: "user", actorId: unverified, organizationId: fx.orgA },
        { id: invoiceId, contactIds: [contactId] },
        { emailSender: sender },
      ),
    ).rejects.toThrow(/Verify your email/);
  });

  it("recipients must be the invoice customer's own contacts", async () => {
    const other = await createCustomer(db, actorInA(), {
      name: "Other Ltd",
      primaryContact: { firstName: "Peter", email: "peter@other.test" },
    });
    const otherContacts = await listContacts(db, fx.orgA, other.customerId);
    const invoiceId = await issuedInvoice(); // customer = Acme
    const { sender } = fakeSender();
    await expect(
      sendInvoice(
        db,
        actorInA(),
        { id: invoiceId, contactIds: [otherContacts[0].id] },
        { emailSender: sender },
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("org B cannot send org A's invoice", async () => {
    const invoiceId = await issuedInvoice();
    const { sender } = fakeSender();
    await expect(
      sendInvoice(db, actorInB(), { id: invoiceId, contactIds: [contactId] }, { emailSender: sender }),
    ).rejects.toThrow(NotFoundError);
    // and a non-member acting "in" org A fails on membership
    await expect(
      sendInvoice(
        db,
        { actorType: "user", actorId: fx.bob.id, organizationId: fx.orgA },
        { id: invoiceId, contactIds: [contactId] },
        { emailSender: sender },
      ),
    ).rejects.toThrow(PermissionError);
  });

  it("the org-wide hourly cap blocks runaway sending", async () => {
    // fill the window artificially rather than looping 30 real sends
    await db.insert(emailMessages).values(
      Array.from({ length: 30 }, () => ({
        id: newId(),
        organizationId: fx.orgA,
        type: "invoice_send",
        recipient: "bulk@example.test",
        status: "sent",
      })),
    );
    const invoiceId = await issuedInvoice();
    const { sender } = fakeSender();
    await expect(
      sendInvoice(db, actorInA(), { id: invoiceId, contactIds: [contactId] }, { emailSender: sender }),
    ).rejects.toThrow(/Sending limit/);
    // cleanup so later tests are unaffected
    await db
      .delete(emailMessages)
      .where(eq(emailMessages.recipient, "bulk@example.test"));
  });

  it("public token resolves issued invoices only, never drafts or bad tokens", async () => {
    const invoiceId = await issuedInvoice();
    const issued = await getInvoice(db, fx.orgA, invoiceId);
    const found = await getInvoiceByPublicToken(db, issued!.publicToken!);
    expect(found).not.toBeNull();
    expect(found!.snapshot.displayNumber).toBe(issued!.displayNumber);
    expect(found!.watermark).toBe(true); // free plan carries the footer

    expect(await getInvoiceByPublicToken(db, "not-a-real-token-at-all")).toBeNull();
    const { invoiceId: draftId } = await createInvoiceDraft(db, actorInA(), draftInput());
    const draft = await getInvoice(db, fx.orgA, draftId);
    expect(draft!.publicToken).toBeNull(); // drafts are structurally unreachable

    // voided documents stay reachable (customers may hold the link), labeled
    await voidInvoice(db, actorInA(), { id: invoiceId, reason: "test" });
    const voided = await getInvoiceByPublicToken(db, issued!.publicToken!);
    expect(voided!.status).toBe("void");
  });

  it("PDF data is byte-stable against later customer edits (Layer 2)", async () => {
    const invoiceId = await issuedInvoice();
    const before = await getInvoicePdfData(db, fx.orgA, invoiceId);

    const cust = await getCustomer(db, fx.orgA, customerA);
    await updateCustomer(db, actorInA(), {
      id: customerA,
      version: cust!.version,
      name: "Acme Renamed Ltd",
      addressLine1: "New Street 42",
    });

    const after = await getInvoicePdfData(db, fx.orgA, invoiceId);
    // identical input ⇒ identical document: the render source is the frozen
    // snapshot, compared here structurally (the PDF binary itself is checked
    // by scripts/check-emails.tsx which renders under tsx)
    expect(after).toEqual(before);
    expect(after!.snapshot.customer.name).toBe("Acme Ltd");

    // drafts have no document
    const { invoiceId: draftId } = await createInvoiceDraft(db, actorInA(), draftInput());
    expect(await getInvoicePdfData(db, fx.orgA, draftId)).toBeNull();
  });

  it("sends a reminder for an outstanding invoice; balance reflects payments", async () => {
    const invoiceId = await issuedInvoice(); // total KES 1160.00
    const { sent, sender } = fakeSender();
    const first = await sendInvoiceReminder(
      db,
      actorInA(),
      { id: invoiceId, contactIds: [contactId] },
      { emailSender: sender, baseUrl: "https://app.example" },
    );
    expect(first.recipients).toEqual(["grace@acme.test"]);
    expect(sent[0].subject).toContain("Reminder: invoice INV-");
    expect(sent[0].text).toContain("1160.00"); // full balance
    expect(sent[0].text).toContain("https://app.example/i/");
    const log = await listInvoiceEmails(db, fx.orgA, invoiceId);
    expect(log.some((e) => e.status === "sent")).toBe(true);
    const [audit] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityId, invoiceId),
          eq(auditLog.action, "invoice.reminder_sent"),
        ),
      );
    expect(audit).toBeDefined();

    // after a partial payment the reminder shows the reduced balance
    await recordPayment(db, actorInA(), {
      invoiceId,
      amount: "400.00",
      currency: "KES",
      method: "mpesa",
      paidAt: "2026-07-09",
    });
    const { sent: sent2, sender: sender2 } = fakeSender();
    await sendInvoiceReminder(
      db,
      actorInA(),
      { id: invoiceId, contactIds: [contactId] },
      { emailSender: sender2 },
    );
    expect(sent2[0].text).toContain("760.00");
  });

  it("reminders are rejected for draft, paid, and void invoices", async () => {
    const { sender } = fakeSender();
    const { invoiceId: draftId } = await createInvoiceDraft(db, actorInA(), draftInput());
    await expect(
      sendInvoiceReminder(db, actorInA(), { id: draftId, contactIds: [contactId] }, { emailSender: sender }),
    ).rejects.toThrow(/Issue the invoice/);

    const paidId = await issuedInvoice();
    await recordPayment(db, actorInA(), {
      invoiceId: paidId,
      amount: "1160.00",
      currency: "KES",
      method: "mpesa",
      paidAt: "2026-07-09",
    });
    await expect(
      sendInvoiceReminder(db, actorInA(), { id: paidId, contactIds: [contactId] }, { emailSender: sender }),
    ).rejects.toThrow(/already paid/);

    const voidId = await issuedInvoice();
    await voidInvoice(db, actorInA(), { id: voidId, reason: "test" });
    await expect(
      sendInvoiceReminder(db, actorInA(), { id: voidId, contactIds: [contactId] }, { emailSender: sender }),
    ).rejects.toThrow(/void invoice cannot be reminded/);
  });
});
