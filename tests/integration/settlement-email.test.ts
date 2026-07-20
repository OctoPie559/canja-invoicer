import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { paymentIntents, subscriptions } from "@/lib/db/schema";
import { newId } from "@/lib/domain/ids";
import type { ActorContext } from "@/lib/audit/context";
import type { EmailMessage } from "@/lib/email/port";
import { notifySettlement } from "@/lib/email/settlement";
import {
  createInvoiceDraft,
  getInvoice,
  issueInvoice,
} from "@/lib/services/invoices";
import { createCustomer } from "@/lib/services/customers";
import { recordPayment } from "@/lib/services/payments";
import { createTestDb } from "../helpers/db";
import { createTwoOrgFixture, type TwoOrgFixture } from "../helpers/fixtures";

/** Capturing fake sender (mirrors invoice-send test). */
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

// Plain-text stand-ins for the JSX templates: vitest doesn't transform the
// react-email .tsx, so we inject text renderers that echo the fields under test.
const renderReceipt = async (p: {
  displayNumber: string;
  amountPaid: string;
  balance: string;
  url: string;
}) => ({
  subject: `Payment received — ${p.displayNumber}`,
  text: `paid ${p.amountPaid} balance ${p.balance} ${p.url}`,
});
const renderUpgrade = async (p: {
  nextBillingDate: string;
  planPrice: string;
  url: string;
}) => ({
  subject: "You're on Canja Pro",
  text: `pro ${p.planPrice} next ${p.nextBillingDate} ${p.url}`,
});

describe("settlement emails (issues 4 & 16)", () => {
  let db: Database;
  let fx: TwoOrgFixture;
  let customerA: string;

  const actorInA = (): ActorContext => ({
    actorType: "user",
    actorId: fx.alice.id,
    organizationId: fx.orgA,
  });

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
  });

  async function issuedInvoice(): Promise<string> {
    const { invoiceId } = await createInvoiceDraft(db, actorInA(), {
      customerId: customerA,
      currency: "KES",
      lines: [
        {
          description: "Consulting",
          quantity: "1",
          unitPrice: "1000.00",
          discountBps: 0,
          taxRateBps: 0,
        },
      ],
    });
    const draft = await getInvoice(db, fx.orgA, invoiceId);
    await issueInvoice(db, actorInA(), {
      id: invoiceId,
      version: draft!.version,
      issueDate: "2026-07-07",
      dueDate: "2026-08-06",
    });
    return invoiceId;
  }

  it("invoice_paid → receipt to the primary contact with received amount and balance", async () => {
    const invoiceId = await issuedInvoice();
    // partial payment: 600 of 1000, so the receipt shows the received amount
    // AND a non-zero remaining balance
    const { paymentId } = await recordPayment(db, actorInA(), {
      invoiceId,
      amount: "600.00",
      currency: "KES",
      method: "cash",
      paidAt: "2026-07-20",
    });

    const reference = `ref-${newId()}`;
    await db.insert(paymentIntents).values({
      id: newId(),
      organizationId: fx.orgA,
      purpose: "invoice",
      invoiceId,
      reference,
      provider: "paystack",
      currency: "KES",
      amountMinor: 60_000n,
      status: "succeeded",
      paymentId,
      initiatedBy: null,
      expiresAt: new Date("2026-07-21"),
    });

    const { sent, sender } = fakeSender();
    await notifySettlement(db, reference, "invoice_paid", { emailSender: sender, baseUrl: "https://app.example", renderReceipt, renderUpgrade });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("grace@acme.test");
    expect(sent[0].subject).toContain("INV-");
    expect(sent[0].text).toContain("600.00"); // received this charge
    expect(sent[0].text).toContain("400.00"); // remaining balance
    expect(sent[0].text).toContain("https://app.example/i/");
  });

  it("subscription_activated → upgrade email to the initiator", async () => {
    await db
      .update(subscriptions)
      .set({ plan: "pro", currentPeriodEnd: new Date("2026-08-20") })
      .where(eq(subscriptions.organizationId, fx.orgA));

    const reference = `ref-${newId()}`;
    await db.insert(paymentIntents).values({
      id: newId(),
      organizationId: fx.orgA,
      purpose: "subscription",
      billingInterval: "monthly",
      reference,
      provider: "paystack",
      currency: "KES",
      amountMinor: 150_000n,
      status: "succeeded",
      initiatedBy: fx.alice.id,
      expiresAt: new Date("2026-07-21"),
    });

    const { sent, sender } = fakeSender();
    await notifySettlement(db, reference, "subscription_activated", { emailSender: sender, baseUrl: "https://app.example", renderReceipt, renderUpgrade });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(fx.alice.email);
    expect(sent[0].text).toContain("2026-08-20"); // next billing date
    expect(sent[0].text).toContain(`https://app.example/orgs/${fx.orgA}/settings/billing`);
  });

  it("stays within the intent's org — never emails another org's contact", async () => {
    // org B has its own customer + primary contact
    const actorInB = (): ActorContext => ({
      actorType: "user",
      actorId: fx.bob.id,
      organizationId: fx.orgB,
    });
    await createCustomer(db, actorInB(), {
      name: "Beta Ltd",
      primaryContact: {
        firstName: "Otieno",
        lastName: "Odhiambo",
        email: "otieno@beta.test",
      },
    });

    // settle an org-A invoice
    const invoiceId = await issuedInvoice();
    const { paymentId } = await recordPayment(db, actorInA(), {
      invoiceId,
      amount: "1000.00",
      currency: "KES",
      method: "cash",
      paidAt: "2026-07-20",
    });
    const reference = `ref-${newId()}`;
    await db.insert(paymentIntents).values({
      id: newId(),
      organizationId: fx.orgA,
      purpose: "invoice",
      invoiceId,
      reference,
      provider: "paystack",
      currency: "KES",
      amountMinor: 100_000n,
      status: "succeeded",
      paymentId,
      expiresAt: new Date("2026-07-21"),
    });

    const { sent, sender } = fakeSender();
    await notifySettlement(db, reference, "invoice_paid", {
      emailSender: sender,
      baseUrl: "https://app.example",
      renderReceipt,
      renderUpgrade,
    });

    // exactly org A's contact, never org B's
    expect(sent.map((m) => m.to)).toEqual(["grace@acme.test"]);
    expect(sent.some((m) => m.to === "otieno@beta.test")).toBe(false);
  });

  it("non-actionable reasons send nothing", async () => {
    const { sent, sender } = fakeSender();
    await notifySettlement(db, "whatever", "duplicate_event", { emailSender: sender, renderReceipt, renderUpgrade });
    await notifySettlement(db, "whatever", "intent_settled", { emailSender: sender, renderReceipt, renderUpgrade });
    expect(sent).toHaveLength(0);
  });
});
