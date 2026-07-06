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
