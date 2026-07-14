import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import {
  auditLog,
  invoices,
  paymentEvents,
  paymentIntents,
  payments,
  subscriptions,
} from "@/lib/db/schema";
import { withOrgTransaction } from "@/lib/db/tx";
import { PermissionError } from "@/lib/domain/errors";
import type { ActorContext } from "@/lib/audit/context";
import type { PaymentProvider } from "@/lib/payments";
import {
  createInvoiceDraft,
  getInvoice,
  issueInvoice,
} from "@/lib/services/invoices";
import {
  initiateInvoiceCharge,
  initiateSubscriptionCharge,
  processProviderEvent,
  reconcilePendingIntents,
} from "@/lib/services/checkout";
import {
  expireLapsedSubscriptions,
  getSubscription,
} from "@/lib/services/subscriptions";
import { createCustomer } from "@/lib/services/customers";
import { createTestDb } from "../helpers/db";
import { createTwoOrgFixture, type TwoOrgFixture } from "../helpers/fixtures";

/**
 * Live payments + self-billing (slice 8). The exit criterion is the hard part:
 * duplicate / out-of-order callbacks are provable no-ops, and every event is
 * traceable payload → payment → invoice → audit. A fake provider stands in for
 * Paystack so the whole webhook path runs against real Postgres; the Paystack
 * signature itself is unit-tested separately.
 */

const BASE_URL = "http://test.local";

/** Fake provider: signature "valid" passes; anything else is rejected. */
function fakeProvider(): PaymentProvider {
  return {
    name: "fake",
    async initiateCharge(p) {
      return {
        reference: p.reference,
        authorizationUrl: `https://pay.test/${p.reference}`,
        providerReference: `acc_${p.reference}`,
      };
    },
    verifyWebhook(rawBody, signature) {
      if (signature !== "valid") return null;
      let body: {
        event?: string;
        data?: {
          id?: string | number;
          reference?: string;
          amount?: number;
          currency?: string;
          status?: string;
          channel?: string;
        };
      };
      try {
        body = JSON.parse(rawBody);
      } catch {
        return null;
      }
      const d = body.data;
      if (!d?.reference || d.id == null || d.amount == null) return null;
      const status =
        d.status === "success"
          ? "success"
          : d.status === "failed"
            ? "failed"
            : "other";
      const method =
        d.channel === "mobile_money"
          ? "mpesa"
          : d.channel === "card"
            ? "card"
            : "other";
      return {
        providerEventId: `${body.event}:${d.id}`,
        eventType: body.event ?? "",
        status,
        method,
        reference: d.reference,
        providerTransactionId: String(d.id),
        amountMinor: BigInt(d.amount),
        currency: d.currency ?? "KES",
        raw: body,
      };
    },
  };
}

function chargePayload(
  reference: string,
  opts: {
    id: string;
    amount: number;
    currency?: string;
    status?: string;
    channel?: string;
    event?: string;
  },
): string {
  return JSON.stringify({
    event: opts.event ?? "charge.success",
    data: {
      id: opts.id,
      reference,
      amount: opts.amount,
      currency: opts.currency ?? "KES",
      status: opts.status ?? "success",
      channel: opts.channel ?? "mobile_money",
    },
  });
}

describe("live payments + self-billing (slice 8)", () => {
  let db: Database;
  let fx: TwoOrgFixture;
  let customerA: string;
  const provider = fakeProvider();

  const actorInA = (): ActorContext => ({
    actorType: "user",
    actorId: fx.alice.id,
    organizationId: fx.orgA,
  });

  async function issued(): Promise<{
    invoiceId: string;
    token: string;
    totalMinor: bigint;
  }> {
    const { invoiceId } = await createInvoiceDraft(db, actorInA(), {
      customerId: customerA,
      currency: "KES",
      lines: [
        {
          description: "Work",
          quantity: "1",
          unitPrice: "1000.00", // total 1000.00, no tax → 100000 minor
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
      dueDate: "2099-01-01",
    });
    const [row] = await db
      .select({
        token: invoices.publicToken,
        totalMinor: invoices.totalMinor,
      })
      .from(invoices)
      .where(eq(invoices.id, invoiceId));
    return { invoiceId, token: row.token!, totalMinor: row.totalMinor ?? 0n };
  }

  const auditCount = (organizationId: string, action: string, entityId?: string) =>
    db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, organizationId),
          eq(auditLog.action, action),
          ...(entityId ? [eq(auditLog.entityId, entityId)] : []),
        ),
      )
      .then((r) => r.length);

  beforeAll(async () => {
    ({ db } = await createTestDb());
    fx = await createTwoOrgFixture(db);
    const c = await createCustomer(db, actorInA(), {
      name: "Acme Ltd",
      customerType: "business",
    });
    customerA = c.customerId;
  });

  it("initiates an invoice charge and records a pending intent", async () => {
    const { invoiceId, token } = await issued();
    const { authorizationUrl, reference } = await initiateInvoiceCharge(
      db,
      provider,
      { token, email: "payer@example.test", baseUrl: BASE_URL },
    );
    expect(authorizationUrl).toContain(reference);

    const [intent] = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.reference, reference));
    expect(intent.status).toBe("pending");
    expect(intent.purpose).toBe("invoice");
    expect(intent.invoiceId).toBe(invoiceId);
    expect(intent.amountMinor).toBe(100000n);
    expect(intent.organizationId).toBe(fx.orgA);
    expect(await auditCount(fx.orgA, "payment.charge_initiated")).toBeGreaterThan(0);
  });

  it("settles a successful charge on the shared payment path, fully traceable", async () => {
    const { invoiceId, token } = await issued();
    const { reference } = await initiateInvoiceCharge(db, provider, {
      token,
      email: "payer@example.test",
      baseUrl: BASE_URL,
    });

    const result = await processProviderEvent(
      db,
      provider,
      chargePayload(reference, { id: "TXN-100", amount: 100000 }),
      "valid",
    );
    expect(result).toEqual({ ok: true, reason: "invoice_paid" });

    const invoice = await getInvoice(db, fx.orgA, invoiceId);
    expect(invoice!.status).toBe("paid");
    expect(invoice!.amountPaidMinor).toBe(100000n);

    const [pay] = await db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId));
    expect(pay.source).toBe("gateway");
    expect(pay.provider).toBe("fake");
    expect(pay.providerTransactionId).toBe("TXN-100");
    expect(pay.method).toBe("mpesa");

    const [ev] = await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.providerEventId, "charge.success:TXN-100"));
    expect(ev.processingStatus).toBe("processed");
    expect(ev.paymentId).toBe(pay.id);

    const [intent] = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.reference, reference));
    expect(intent.status).toBe("succeeded");
    expect(intent.paymentId).toBe(pay.id);

    // gateway payment is attributed to the SYSTEM actor, not a user
    const [recorded] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "payment.recorded"),
          eq(auditLog.entityId, pay.id),
        ),
      );
    expect(recorded.actorType).toBe("system");
    expect(await auditCount(fx.orgA, "invoice.paid", invoiceId)).toBe(1);
  });

  it("no-ops a duplicate callback (same event id)", async () => {
    const { invoiceId, token } = await issued();
    const { reference } = await initiateInvoiceCharge(db, provider, {
      token,
      email: "payer@example.test",
      baseUrl: BASE_URL,
    });
    const payload = chargePayload(reference, { id: "TXN-DUP", amount: 100000 });

    const first = await processProviderEvent(db, provider, payload, "valid");
    expect(first.reason).toBe("invoice_paid");
    const second = await processProviderEvent(db, provider, payload, "valid");
    expect(second.reason).toBe("duplicate_event");

    // exactly one payment, one event, balance unchanged
    const pays = await db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId));
    expect(pays).toHaveLength(1);
    const events = await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.providerEventId, "charge.success:TXN-DUP"));
    expect(events).toHaveLength(1);
    const invoice = await getInvoice(db, fx.orgA, invoiceId);
    expect(invoice!.amountPaidMinor).toBe(100000n);
  });

  it("no-ops an out-of-order callback for an already-settled intent", async () => {
    const { invoiceId, token } = await issued();
    const { reference } = await initiateInvoiceCharge(db, provider, {
      token,
      email: "payer@example.test",
      baseUrl: BASE_URL,
    });
    await processProviderEvent(
      db,
      provider,
      chargePayload(reference, { id: "TXN-A", amount: 100000 }),
      "valid",
    );
    // a DIFFERENT event id lands late for the same, now-settled intent
    const late = await processProviderEvent(
      db,
      provider,
      chargePayload(reference, { id: "TXN-B", amount: 100000 }),
      "valid",
    );
    expect(late.reason).toBe("intent_settled");

    const pays = await db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId));
    expect(pays).toHaveLength(1);
    const invoice = await getInvoice(db, fx.orgA, invoiceId);
    expect(invoice!.amountPaidMinor).toBe(100000n);
  });

  it("rejects an invalid signature and writes nothing", async () => {
    const { invoiceId, token } = await issued();
    const { reference } = await initiateInvoiceCharge(db, provider, {
      token,
      email: "payer@example.test",
      baseUrl: BASE_URL,
    });
    const result = await processProviderEvent(
      db,
      provider,
      chargePayload(reference, { id: "TXN-BAD", amount: 100000 }),
      "forged",
    );
    expect(result).toEqual({ ok: false, reason: "invalid_signature" });

    const events = await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.providerEventId, "charge.success:TXN-BAD"));
    expect(events).toHaveLength(0);
    const invoice = await getInvoice(db, fx.orgA, invoiceId);
    expect(invoice!.status).toBe("sent");
  });

  it("handles a callback with no matching intent", async () => {
    const result = await processProviderEvent(
      db,
      provider,
      chargePayload("cnj_does_not_exist", { id: "TXN-X", amount: 5000 }),
      "valid",
    );
    expect(result).toEqual({ ok: true, reason: "unmatched" });
    const events = await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.providerEventId, "charge.success:TXN-X"));
    expect(events).toHaveLength(0);
  });

  it("marks a failed charge without touching the invoice", async () => {
    const { invoiceId, token } = await issued();
    const { reference } = await initiateInvoiceCharge(db, provider, {
      token,
      email: "payer@example.test",
      baseUrl: BASE_URL,
    });
    const result = await processProviderEvent(
      db,
      provider,
      chargePayload(reference, {
        id: "TXN-FAIL",
        amount: 100000,
        status: "failed",
        event: "charge.failed",
      }),
      "valid",
    );
    expect(result.reason).toBe("charge_failed");

    const [intent] = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.reference, reference));
    expect(intent.status).toBe("failed");
    const pays = await db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId));
    expect(pays).toHaveLength(0);
    const invoice = await getInvoice(db, fx.orgA, invoiceId);
    expect(invoice!.status).toBe("sent");
  });

  it("activates Pro when a subscription charge succeeds", async () => {
    const { reference } = await initiateSubscriptionCharge(
      db,
      provider,
      actorInA(),
      { interval: "monthly" },
      { baseUrl: BASE_URL },
    );
    const [intent] = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.reference, reference));
    expect(intent.purpose).toBe("subscription");
    expect(intent.currency).toBe("KES");
    expect(intent.amountMinor).toBe(150000n);

    const result = await processProviderEvent(
      db,
      provider,
      chargePayload(reference, { id: "TXN-SUB", amount: 150000 }),
      "valid",
    );
    expect(result.reason).toBe("subscription_activated");

    const sub = await getSubscription(db, fx.orgA);
    expect(sub.plan).toBe("pro");
    expect(sub.status).toBe("active");
    expect(sub.currentPeriodEnd).not.toBeNull();
    expect(await auditCount(fx.orgA, "subscription.activated", fx.orgA)).toBe(1);
  });

  it("rejects subscription checkout from a non-member", async () => {
    const ctx: ActorContext = {
      actorType: "user",
      actorId: fx.bob.id, // owner of org B, not a member of org A
      organizationId: fx.orgA,
    };
    await expect(
      initiateSubscriptionCharge(
        db,
        provider,
        ctx,
        { interval: "monthly" },
        { baseUrl: BASE_URL },
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("sweeps abandoned charge attempts, leaving fresh ones alone", async () => {
    const { token } = await issued();
    const { reference: stale } = await initiateInvoiceCharge(db, provider, {
      token,
      email: "payer@example.test",
      baseUrl: BASE_URL,
    });
    const { token: token2 } = await issued();
    const { reference: fresh } = await initiateInvoiceCharge(db, provider, {
      token: token2,
      email: "payer@example.test",
      baseUrl: BASE_URL,
    });
    // age the first intent past its TTL
    await db
      .update(paymentIntents)
      .set({ expiresAt: new Date("2000-01-01T00:00:00Z") })
      .where(eq(paymentIntents.reference, stale));

    const { swept } = await reconcilePendingIntents(db, new Date());
    expect(swept).toBeGreaterThanOrEqual(1);

    const [staleIntent] = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.reference, stale));
    expect(staleIntent.status).toBe("abandoned");
    const [freshIntent] = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.reference, fresh));
    expect(freshIntent.status).toBe("pending");
    expect(await auditCount(fx.orgA, "payment.charge_abandoned")).toBeGreaterThan(0);
  });

  it("downgrades a lapsed Pro subscription, keeping current ones", async () => {
    // org B: Pro but its paid period ended yesterday
    await db
      .update(subscriptions)
      .set({
        plan: "pro",
        status: "active",
        currentPeriodEnd: new Date("2000-01-01T00:00:00Z"),
      })
      .where(eq(subscriptions.organizationId, fx.orgB));

    const { downgraded } = await expireLapsedSubscriptions(db, new Date());
    expect(downgraded).toBeGreaterThanOrEqual(1);

    const subB = await getSubscription(db, fx.orgB);
    expect(subB.plan).toBe("free");
    expect(subB.status).toBe("expired");
    // org A is Pro with a FUTURE period end (activated above) — untouched
    const subA = await getSubscription(db, fx.orgA);
    expect(subA.plan).toBe("pro");
    expect(await auditCount(fx.orgB, "subscription.expired", fx.orgB)).toBe(1);
  });

  it("isolates payment intents across tenants (RLS backstop)", async () => {
    const { token } = await issued();
    const { reference } = await initiateInvoiceCharge(db, provider, {
      token,
      email: "payer@example.test",
      baseUrl: BASE_URL,
    });
    // org B, scoped by RLS, cannot see org A's intent
    const visibleFromB = await withOrgTransaction(db, fx.orgB, (tx) =>
      tx
        .select()
        .from(paymentIntents)
        .where(eq(paymentIntents.reference, reference)),
    );
    expect(visibleFromB).toHaveLength(0);
  });
});
