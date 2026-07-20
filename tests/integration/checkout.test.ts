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
  getReturnDestination,
  initiateInvoiceCharge,
  initiateSubscriptionCharge,
  processProviderEvent,
  reconcilePendingIntents,
  remindDueManualSubscriptions,
  renewDueSubscriptions,
  verifyAndProcessCharge,
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

/** A transaction the fake "provider" would return from its verify endpoint. */
interface SeededTxn {
  id: string;
  amount: number;
  status?: string;
  channel?: string;
  currency?: string;
}
type FakeProvider = PaymentProvider & {
  seed(reference: string, txn: SeededTxn): void;
  /** Control what the next chargeAuthorization returns (wave 6 renewals). */
  authOutcome: "success" | "failed" | "apierror";
};

/** Fake provider: signature "valid" passes; anything else is rejected. */
function fakeProvider(): FakeProvider {
  const txns = new Map<string, SeededTxn>();
  return {
    name: "fake",
    authOutcome: "success",
    seed(reference, txn) {
      txns.set(reference, txn);
    },
    async chargeAuthorization(p) {
      if (this.authOutcome === "apierror") return null;
      const status = this.authOutcome === "failed" ? "failed" : "success";
      const eventType =
        status === "success" ? "charge.success" : "charge.failed";
      const id = `auth_${p.reference}`;
      return {
        providerEventId: `${eventType}:${id}`,
        eventType,
        status,
        method: "card",
        reference: p.reference,
        providerTransactionId: id,
        amountMinor: p.amountMinor,
        currency: p.currency,
        authorization: {
          authorizationCode: p.authorizationCode,
          reusable: true,
          channel: "card",
        },
        customerCode: "cust_fake",
        raw: {},
      };
    },
    async initiateCharge(p) {
      return {
        reference: p.reference,
        authorizationUrl: `https://pay.test/${p.reference}`,
        providerReference: `acc_${p.reference}`,
      };
    },
    async fetchTransaction(reference) {
      const t = txns.get(reference);
      if (!t) return null;
      const status =
        t.status === "failed"
          ? "failed"
          : t.status === "pending"
            ? "pending"
            : "success";
      const eventType =
        status === "success"
          ? "charge.success"
          : status === "failed"
            ? "charge.failed"
            : "charge.pending";
      const method =
        t.channel === "card"
          ? "card"
          : t.channel === "bank"
            ? "bank"
            : "mpesa";
      return {
        providerEventId: `${eventType}:${t.id}`,
        eventType,
        status,
        method,
        reference,
        providerTransactionId: String(t.id),
        amountMinor: BigInt(t.amount),
        currency: t.currency ?? "KES",
        raw: { verify: t },
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
    expect(result).toMatchObject({ ok: true, reason: "invoice_paid" });

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
    expect(await auditCount(fx.orgA, "payment.charge_failed", intent.id)).toBe(1);
  });

  it("rejects an unknown billing interval server-side", async () => {
    await expect(
      initiateSubscriptionCharge(
        db,
        provider,
        actorInA(),
        { interval: "weekly" as never },
        { baseUrl: BASE_URL },
      ),
    ).rejects.toThrowError();
    // nothing persisted for the bad interval
    const intents = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.billingInterval, "weekly"));
    expect(intents).toHaveLength(0);
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

  it("settles an invoice via checkout-return verification (no webhook)", async () => {
    const { invoiceId, token } = await issued();
    const { reference } = await initiateInvoiceCharge(db, provider, {
      token,
      email: "payer@example.test",
      baseUrl: BASE_URL,
    });
    // the payer returns from checkout; the webhook has not arrived
    provider.seed(reference, { id: "TXN-CB1", amount: 100000 });
    const result = await verifyAndProcessCharge(db, provider, reference);
    expect(result).toMatchObject({ ok: true, reason: "invoice_paid" });

    const invoice = await getInvoice(db, fx.orgA, invoiceId);
    expect(invoice!.status).toBe("paid");
    const [pay] = await db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId));
    expect(pay.source).toBe("gateway");
    expect(pay.providerTransactionId).toBe("TXN-CB1");
  });

  it("converges with the webhook on a single settlement", async () => {
    const { invoiceId, token } = await issued();
    const { reference } = await initiateInvoiceCharge(db, provider, {
      token,
      email: "payer@example.test",
      baseUrl: BASE_URL,
    });
    provider.seed(reference, { id: "TXN-CB2", amount: 100000 });

    // callback-verify settles first...
    const viaReturn = await verifyAndProcessCharge(db, provider, reference);
    expect(viaReturn.reason).toBe("invoice_paid");
    // ...then the webhook for the SAME transaction lands — a clean no-op
    const viaWebhook = await processProviderEvent(
      db,
      provider,
      chargePayload(reference, { id: "TXN-CB2", amount: 100000 }),
      "valid",
    );
    expect(viaWebhook.reason).toBe("duplicate_event");

    const pays = await db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId));
    expect(pays).toHaveLength(1);
    const invoice = await getInvoice(db, fx.orgA, invoiceId);
    expect(invoice!.amountPaidMinor).toBe(100000n);
  });

  it("no-ops when the reference cannot be verified", async () => {
    const { token } = await issued();
    const { reference } = await initiateInvoiceCharge(db, provider, {
      token,
      email: "payer@example.test",
      baseUrl: BASE_URL,
    });
    // provider has no record of this reference (unpaid / abandoned)
    const result = await verifyAndProcessCharge(db, provider, reference);
    expect(result).toEqual({ ok: true, reason: "unverified" });
    const [intent] = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.reference, reference));
    expect(intent.status).toBe("pending");
  });

  it("resolves the checkout-return destination per purpose", async () => {
    const { token } = await issued();
    const { reference: invRef } = await initiateInvoiceCharge(db, provider, {
      token,
      email: "payer@example.test",
      baseUrl: BASE_URL,
    });
    expect(await getReturnDestination(db, invRef)).toBe(`/i/${token}?paid=1`);

    const { reference: subRef } = await initiateSubscriptionCharge(
      db,
      provider,
      actorInA(),
      { interval: "annual" },
      { baseUrl: BASE_URL },
    );
    expect(await getReturnDestination(db, subRef)).toBe(
      `/orgs/${fx.orgA}/settings/billing?upgraded=1`,
    );
    expect(await getReturnDestination(db, "cnj_unknown")).toBe("/");
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

describe("recurring renewals (wave 6, self-managed)", () => {
  let db: Database;
  let fx: TwoOrgFixture;
  const provider = fakeProvider();

  const DAY = 24 * 60 * 60 * 1000;
  const now = new Date("2026-08-01T09:00:00Z");
  const yesterday = new Date(now.getTime() - DAY);

  beforeAll(async () => {
    ({ db } = await createTestDb());
    fx = await createTwoOrgFixture(db);
  });

  /** Put org A's subscription into an arbitrary state for the cron to act on. */
  async function setSub(fields: Record<string, unknown>) {
    await db
      .update(subscriptions)
      .set(fields)
      .where(eq(subscriptions.organizationId, fx.orgA));
  }

  const autoDueState = {
    plan: "pro" as const,
    status: "active",
    renewalMode: "auto",
    billingInterval: "monthly",
    authorizationCode: "AUTH_test",
    cancelAtPeriodEnd: false,
    currentPeriodStart: new Date(now.getTime() - 30 * DAY),
    currentPeriodEnd: yesterday, // due
    graceUntil: null,
  };

  it("charges the saved card and extends the period", async () => {
    await setSub(autoDueState);
    provider.authOutcome = "success";

    const res = await renewDueSubscriptions(db, provider, now);
    expect(res).toMatchObject({ attempted: 1, renewed: 1, failed: 0 });

    const sub = await getSubscription(db, fx.orgA);
    expect(sub.plan).toBe("pro");
    expect(sub.currentPeriodEnd!.getTime()).toBeGreaterThan(now.getTime());
    expect(sub.cancelAtPeriodEnd).toBe(false);
  });

  it("a declined card opens a grace window and keeps Pro; downgrades only after grace", async () => {
    await setSub({ ...autoDueState, graceUntil: null });
    provider.authOutcome = "failed";

    const res = await renewDueSubscriptions(db, provider, now);
    expect(res).toMatchObject({ attempted: 1, renewed: 0, failed: 1 });

    let sub = await getSubscription(db, fx.orgA);
    expect(sub.plan).toBe("pro"); // still Pro during grace
    expect(sub.status).toBe("past_due");

    // within grace: expiry cron must NOT downgrade
    await expireLapsedSubscriptions(db, now);
    sub = await getSubscription(db, fx.orgA);
    expect(sub.plan).toBe("pro");

    // after grace: expiry cron downgrades
    await expireLapsedSubscriptions(db, new Date(now.getTime() + 5 * DAY));
    sub = await getSubscription(db, fx.orgA);
    expect(sub.plan).toBe("free");
    expect(sub.status).toBe("expired");
  });

  it("skips a subscription scheduled to cancel", async () => {
    await setSub({ ...autoDueState, cancelAtPeriodEnd: true });
    provider.authOutcome = "success";
    const res = await renewDueSubscriptions(db, provider, now);
    expect(res.attempted).toBe(0);
  });

  it("does not charge a manual (M-Pesa) subscription", async () => {
    await setSub({ ...autoDueState, renewalMode: "manual" });
    provider.authOutcome = "success";
    const res = await renewDueSubscriptions(db, provider, now);
    expect(res.attempted).toBe(0);
  });

  it("a provider API error also enters grace (retryable), never downgrades immediately", async () => {
    await setSub({ ...autoDueState, graceUntil: null });
    provider.authOutcome = "apierror";
    const res = await renewDueSubscriptions(db, provider, now);
    expect(res).toMatchObject({ attempted: 1, failed: 1 });
    const sub = await getSubscription(db, fx.orgA);
    expect(sub.plan).toBe("pro");
    expect(sub.status).toBe("past_due");
  });

  it("reminds a manual (M-Pesa) subscription once per period", async () => {
    await setSub({
      ...autoDueState,
      renewalMode: "manual",
      authorizationCode: null,
      currentPeriodStart: new Date(now.getTime() - 27 * DAY),
      currentPeriodEnd: new Date(now.getTime() + 2 * DAY), // within 3-day lead
      graceUntil: null,
    });

    const first = await remindDueManualSubscriptions(db, now);
    expect(first).toHaveLength(1);
    expect(first[0].organizationId).toBe(fx.orgA);
    expect(first[0].email).toBe(fx.alice.email);

    // second run in the same period: already reminded → nothing
    const second = await remindDueManualSubscriptions(db, now);
    expect(second).toHaveLength(0);
  });

  it("does not remind an auto (card) subscription", async () => {
    await setSub({
      ...autoDueState,
      renewalMode: "auto",
      currentPeriodEnd: new Date(now.getTime() + 2 * DAY),
    });
    const res = await remindDueManualSubscriptions(db, now);
    expect(res).toHaveLength(0);
  });
});
