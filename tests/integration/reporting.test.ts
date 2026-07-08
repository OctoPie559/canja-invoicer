import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { customers, invoices } from "@/lib/db/schema";
import { newId } from "@/lib/domain/ids";
import { getFinancialOverview } from "@/lib/services/reporting";
import { createTestDb } from "../helpers/db";
import { createTwoOrgFixture, type TwoOrgFixture } from "../helpers/fixtures";

/**
 * Admin fixture note: the invoice service arrives in slice 2; until then
 * rows are seeded directly to exercise the aggregation math. Once the
 * service exists, these fixtures switch to it (§9.2).
 */
async function seedInvoice(
  db: Database,
  organizationId: string,
  row: {
    status: "draft" | "sent" | "partial" | "paid" | "overdue" | "void";
    currency: string;
    fxRateToBase?: string;
    totalMinor: bigint;
    amountPaidMinor?: bigint;
  },
) {
  const customerId = newId();
  await db.insert(customers).values({
    id: customerId,
    organizationId,
    name: `Fixture customer ${customerId.slice(-4)}`,
  });
  await db.insert(invoices).values({
    id: newId(),
    organizationId,
    customerId,
    status: row.status,
    currency: row.currency,
    fxRateToBase: row.fxRateToBase,
    totalMinor: row.totalMinor,
    amountPaidMinor: row.amountPaidMinor ?? 0n,
  });
}

describe("financial overview", () => {
  let db: Database;
  let fx: TwoOrgFixture;

  beforeAll(async () => {
    ({ db } = await createTestDb());
    fx = await createTwoOrgFixture(db);
  });

  it("returns zeros for a fresh organization", async () => {
    const overview = await getFinancialOverview(db, fx.orgA);
    expect(overview.baseCurrency).toBe("KES");
    expect(overview.outstanding.amountMinor).toBe(0n);
    expect(overview.overdue.amountMinor).toBe(0n);
    expect(overview.collected.amountMinor).toBe(0n);
    expect(overview.draftCount).toBe(0);
    expect(overview.openInvoiceCount).toBe(0);
    expect(overview.unconvertibleCount).toBe(0);
  });

  it("aggregates statuses in base currency with per-invoice FX snapshots", async () => {
    // KES invoices: one sent (10,000.00, nothing paid), one partial
    // (5,000.00 with 2,000.00 paid), one overdue (1,500.00), one paid
    // (3,000.00), one draft, one void
    await seedInvoice(db, fx.orgA, { status: "sent", currency: "KES", totalMinor: 1_000_000n });
    await seedInvoice(db, fx.orgA, { status: "partial", currency: "KES", totalMinor: 500_000n, amountPaidMinor: 200_000n });
    await seedInvoice(db, fx.orgA, { status: "overdue", currency: "KES", totalMinor: 150_000n });
    await seedInvoice(db, fx.orgA, { status: "paid", currency: "KES", totalMinor: 300_000n, amountPaidMinor: 300_000n });
    await seedInvoice(db, fx.orgA, { status: "draft", currency: "KES", totalMinor: 700_000n });
    await seedInvoice(db, fx.orgA, { status: "void", currency: "KES", totalMinor: 900_000n });
    // USD 100.00 sent at 129.50 KES/USD → 12,950.00 KES outstanding
    await seedInvoice(db, fx.orgA, { status: "sent", currency: "USD", fxRateToBase: "129.50", totalMinor: 10_000n });
    // foreign invoice with a missing snapshot: excluded, surfaced
    await seedInvoice(db, fx.orgA, { status: "sent", currency: "EUR", totalMinor: 5_000n });

    const o = await getFinancialOverview(db, fx.orgA);
    // outstanding: 10,000 + 3,000 + 1,500 + 12,950 = 27,450.00 KES
    expect(o.outstanding.amountMinor).toBe(2_745_000n);
    expect(o.overdue.amountMinor).toBe(150_000n);
    expect(o.overdueCount).toBe(1);
    // collected: 2,000 (partial) + 3,000 (paid) = 5,000.00 KES
    expect(o.collected.amountMinor).toBe(500_000n);
    expect(o.draftCount).toBe(1);
    expect(o.openInvoiceCount).toBe(4); // sent + partial + overdue + USD sent
    expect(o.unconvertibleCount).toBe(1); // the EUR invoice, never fudged
    expect(o.customerCount).toBeGreaterThan(0);
  });

  it("is tenant-isolated: org B sees none of org A's numbers", async () => {
    const o = await getFinancialOverview(db, fx.orgB);
    expect(o.outstanding.amountMinor).toBe(0n);
    expect(o.collected.amountMinor).toBe(0n);
    expect(o.customerCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// slice 5: fixtures now build THROUGH the services (§9.2 — slice 2+ exists)

import type { ActorContext } from "@/lib/audit/context";
import { createCustomer } from "@/lib/services/customers";
import {
  createInvoiceDraft,
  getInvoice,
  issueInvoice,
} from "@/lib/services/invoices";
import { markOverdueInvoices, recordPayment } from "@/lib/services/payments";
import {
  getAgingBuckets,
  getCashFlow,
  getCollectedThisMonth,
  getStatusBreakdown,
  getTopCustomers,
} from "@/lib/services/reporting";
import { upgradeToPro } from "../helpers/fixtures";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

describe("slice-5 reporting (service-built fixtures)", () => {
  let db: Database;
  let fx: TwoOrgFixture;
  let acme: string;
  let beta: string;
  const today = new Date().toISOString().slice(0, 10);

  const actor = (): ActorContext => ({
    actorType: "user",
    actorId: fx.alice.id,
    organizationId: fx.orgA,
  });

  async function issue(opts: {
    customerId: string;
    currency: "KES" | "USD";
    amount: string;
    fxRateToBase?: string;
    issueDate?: string;
    dueDate?: string;
  }): Promise<string> {
    const { invoiceId } = await createInvoiceDraft(db, actor(), {
      customerId: opts.customerId,
      currency: opts.currency,
      lines: [
        {
          description: "Work",
          quantity: "1",
          unitPrice: opts.amount,
          discountBps: 0,
          taxRateBps: 0,
        },
      ],
    });
    const draft = await getInvoice(db, fx.orgA, invoiceId);
    await issueInvoice(db, actor(), {
      id: invoiceId,
      version: draft!.version,
      issueDate: opts.issueDate ?? today,
      dueDate: opts.dueDate ?? isoDaysAgo(-30),
      ...(opts.fxRateToBase ? { fxRateToBase: opts.fxRateToBase } : {}),
    });
    return invoiceId;
  }

  beforeAll(async () => {
    ({ db } = await createTestDb());
    fx = await createTwoOrgFixture(db);
    await upgradeToPro(db, fx.orgA);
    acme = (await createCustomer(db, actor(), { name: "Acme Ltd" })).customerId;
    beta = (await createCustomer(db, actor(), { name: "Beta Ltd" })).customerId;

    // 1) KES 1,000 issued today, 400 paid → outstanding 600
    const kes = await issue({ customerId: acme, currency: "KES", amount: "1000.00" });
    await recordPayment(db, actor(), {
      invoiceId: kes,
      amount: "400.00",
      currency: "KES",
      method: "mpesa",
      paidAt: today,
    });

    // 2) USD 1,000 at 129.55 issued today, USD 250 paid
    //    → outstanding USD 750 = KES 97,162.50; collected USD 250 = KES 32,387.50
    const usd = await issue({
      customerId: beta,
      currency: "USD",
      amount: "1000.00",
      fxRateToBase: "129.55",
    });
    await recordPayment(db, actor(), {
      invoiceId: usd,
      amount: "250.00",
      currency: "USD",
      method: "bank",
      paidAt: today,
    });

    // 3) KES 500 issued 60 days ago, due 45 days ago, unpaid → overdue, 31-60 bucket
    await issue({
      customerId: acme,
      currency: "KES",
      amount: "500.00",
      issueDate: isoDaysAgo(60),
      dueDate: isoDaysAgo(45),
    });
    await markOverdueInvoices(db, today);
  });

  it("cash flow converts through each invoice's own rate", async () => {
    const { months, unconvertibleCount } = await getCashFlow(db, fx.orgA, 6);
    expect(unconvertibleCount).toBe(0);
    const current = months[months.length - 1];
    // invoiced this month: KES 1,000 + USD 1,000 × 129.55 = 130,550.00
    expect(current.invoiced.amountMinor).toBe(13_055_000n);
    // collected this month: KES 400 + USD 250 × 129.55 = 32,787.50
    expect(current.collected.amountMinor).toBe(3_278_750n);
    // the 60-days-ago invoice lands in an earlier month, not this one
    const totalInvoiced = months.reduce(
      (acc, m) => acc.add(m.invoiced),
      current.invoiced.subtract(current.invoiced),
    );
    expect(totalInvoiced.amountMinor).toBe(13_105_000n); // + KES 500

    const tile = await getCollectedThisMonth(db, fx.orgA);
    expect(tile.amount.amountMinor).toBe(current.collected.amountMinor);
  });

  it("status breakdown reconciles with the financial overview", async () => {
    const overview = await getFinancialOverview(db, fx.orgA);
    const { rows, unconvertibleCount } = await getStatusBreakdown(db, fx.orgA);
    expect(unconvertibleCount).toBe(0);

    const outstandingSum = rows.reduce(
      (acc, r) => acc.add(r.outstanding),
      overview.outstanding.subtract(overview.outstanding),
    );
    expect(outstandingSum.amountMinor).toBe(overview.outstanding.amountMinor);
    // KES 600 + KES 97,162.50 + KES 500 = 98,262.50
    expect(overview.outstanding.amountMinor).toBe(9_826_250n);

    const overdueRow = rows.find((r) => r.status === "overdue");
    expect(overdueRow?.count).toBe(1);
    expect(overdueRow?.outstanding.amountMinor).toBe(50_000n);
  });

  it("aging buckets place balances by days past due", async () => {
    const { buckets, unconvertibleCount } = await getAgingBuckets(db, fx.orgA, today);
    expect(unconvertibleCount).toBe(0);
    const byName = new Map(buckets.map((b) => [b.bucket, b]));
    // the two fresh invoices are not yet due
    expect(byName.get("current")!.count).toBe(2);
    expect(byName.get("current")!.amount.amountMinor).toBe(9_776_250n);
    // the overdue KES 500 is 45 days past due
    expect(byName.get("31-60")!.count).toBe(1);
    expect(byName.get("31-60")!.amount.amountMinor).toBe(50_000n);
    // buckets reconcile with the overview outstanding
    const overview = await getFinancialOverview(db, fx.orgA);
    const sum = buckets.reduce(
      (acc, b) => acc.add(b.amount),
      overview.outstanding.subtract(overview.outstanding),
    );
    expect(sum.amountMinor).toBe(overview.outstanding.amountMinor);
  });

  it("top customers rank by outstanding and reconcile", async () => {
    const { rows } = await getTopCustomers(db, fx.orgA, 5);
    expect(rows[0].customerId).toBe(beta); // USD 750 outstanding ≈ 97,162.50
    expect(rows[0].outstanding.amountMinor).toBe(9_716_250n);
    const acmeRow = rows.find((r) => r.customerId === acme)!;
    expect(acmeRow.outstanding.amountMinor).toBe(110_000n); // 600 + 500
    expect(acmeRow.billed.amountMinor).toBe(150_000n); // 1,000 + 500

    const overview = await getFinancialOverview(db, fx.orgA);
    const sum = rows.reduce(
      (acc, r) => acc.add(r.outstanding),
      overview.outstanding.subtract(overview.outstanding),
    );
    expect(sum.amountMinor).toBe(overview.outstanding.amountMinor);
  });

  it("org B sees none of org A's numbers", async () => {
    const { rows } = await getTopCustomers(db, fx.orgB, 5);
    expect(rows).toHaveLength(0);
    const { months } = await getCashFlow(db, fx.orgB, 3);
    expect(months.every((m) => m.invoiced.isZero() && m.collected.isZero())).toBe(true);
  });
});
