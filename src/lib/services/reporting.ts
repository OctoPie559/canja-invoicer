import { and, count, eq, gte, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import {
  customers,
  invoices,
  organizationSettings,
  payments,
  products,
} from "@/lib/db/schema";
import { Money } from "@/lib/domain/money";

/**
 * Financial overview (dashboard tiles). Aggregates are expressed in the
 * org's base currency; each foreign-currency invoice converts through ITS
 * OWN fx snapshot (brief §5.6) — raw amounts in different currencies are
 * never summed. Issued invoices always carry a snapshot (slice 2 enforces
 * it); a missing rate excludes the invoice from totals and is surfaced so
 * the UI can warn rather than silently misstate finances.
 *
 * Slice 5 (dashboard & reporting) expands this; the conversion rules here
 * are the ones it must keep.
 */
export interface FinancialOverview {
  baseCurrency: string;
  outstanding: Money; // sent + partial + overdue: total - paid
  overdue: Money;
  overdueCount: number;
  collected: Money; // lifetime amount paid
  draftCount: number;
  openInvoiceCount: number; // sent + partial + overdue
  unconvertibleCount: number; // foreign-currency invoices missing a rate
  customerCount: number;
  productCount: number;
}

const OPEN_STATUSES = new Set(["sent", "partial", "overdue"]);

export async function getFinancialOverview(
  db: Database,
  organizationId: string,
): Promise<FinancialOverview> {
  const [settings] = await db
    .select({ baseCurrency: organizationSettings.baseCurrency })
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, organizationId))
    .limit(1);
  const base = settings?.baseCurrency ?? "KES";

  const rows = await db
    .select({
      status: invoices.status,
      currency: invoices.currency,
      fxRateToBase: invoices.fxRateToBase,
      totalMinor: invoices.totalMinor,
      amountPaidMinor: invoices.amountPaidMinor,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        isNull(invoices.deletedAt),
      ),
    );

  let outstanding = Money.zero(base);
  let overdue = Money.zero(base);
  let collected = Money.zero(base);
  let overdueCount = 0;
  let draftCount = 0;
  let openInvoiceCount = 0;
  let unconvertibleCount = 0;

  const toBase = (amountMinor: bigint, currency: string, rate: string | null) => {
    const amount = Money.fromMinor(amountMinor, currency);
    if (currency === base) return amount;
    if (!rate) return null; // never sum cross-currency without a stored rate
    return amount.convert(rate, base);
  };

  for (const row of rows) {
    if (row.status === "draft") {
      draftCount += 1;
      continue;
    }
    if (row.status === "void") continue;

    const paid = toBase(row.amountPaidMinor, row.currency, row.fxRateToBase);
    const remaining = toBase(
      row.totalMinor - row.amountPaidMinor,
      row.currency,
      row.fxRateToBase,
    );
    if (paid === null || remaining === null) {
      unconvertibleCount += 1;
      continue;
    }

    collected = collected.add(paid);
    if (OPEN_STATUSES.has(row.status)) {
      openInvoiceCount += 1;
      outstanding = outstanding.add(remaining);
      if (row.status === "overdue") {
        overdueCount += 1;
        overdue = overdue.add(remaining);
      }
    }
  }

  const [{ value: customerCount }] = await db
    .select({ value: count() })
    .from(customers)
    .where(
      and(
        eq(customers.organizationId, organizationId),
        isNull(customers.deletedAt),
      ),
    );
  const [{ value: productCount }] = await db
    .select({ value: count() })
    .from(products)
    .where(
      and(
        eq(products.organizationId, organizationId),
        isNull(products.deletedAt),
      ),
    );

  return {
    baseCurrency: base,
    outstanding,
    overdue,
    overdueCount,
    collected,
    draftCount,
    openInvoiceCount,
    unconvertibleCount,
    customerCount,
    productCount,
  };
}

// ---------------------------------------------------------------------------
// slice 5: cash flow, breakdowns, aging — same conversion discipline as the
// overview above: per-invoice snapshot rates, never raw cross-currency sums.

/** Shared per-row converter; null = missing rate (excluded + surfaced). */
function baseConverter(base: string) {
  return (amountMinor: bigint, currency: string, rate: string | null) => {
    const amount = Money.fromMinor(amountMinor, currency);
    if (currency === base) return amount;
    if (!rate) return null;
    return amount.convert(rate, base);
  };
}

function monthKey(d: Date | string): string {
  return (typeof d === "string" ? d : d.toISOString()).slice(0, 7);
}

async function orgBaseCurrency(
  db: Database,
  organizationId: string,
): Promise<string> {
  const [settings] = await db
    .select({ baseCurrency: organizationSettings.baseCurrency })
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, organizationId))
    .limit(1);
  return settings?.baseCurrency ?? "KES";
}

export interface CashFlowMonth {
  /** "2026-07" */
  month: string;
  invoiced: Money;
  collected: Money;
}

/**
 * Monthly money-out-the-door vs money-in, last `months` calendar months
 * (oldest first). Invoiced = issued documents by issue date; collected =
 * payments by paid date, each converted through its OWN invoice's rate.
 */
export async function getCashFlow(
  db: Database,
  organizationId: string,
  months = 6,
): Promise<{ months: CashFlowMonth[]; unconvertibleCount: number }> {
  const base = await orgBaseCurrency(db, organizationId);
  const toBase = baseConverter(base);

  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCMonth(start.getUTCMonth() - (months - 1));
  const startDate = start.toISOString().slice(0, 10);

  const buckets = new Map<string, CashFlowMonth>();
  for (let i = 0; i < months; i++) {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + i);
    const key = monthKey(d);
    buckets.set(key, {
      month: key,
      invoiced: Money.zero(base),
      collected: Money.zero(base),
    });
  }
  let unconvertibleCount = 0;

  const issued = await db
    .select({
      issueDate: invoices.issueDate,
      currency: invoices.currency,
      fxRateToBase: invoices.fxRateToBase,
      totalMinor: invoices.totalMinor,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        isNull(invoices.deletedAt),
        isNotNull(invoices.issuedAt),
        ne(invoices.status, "void"),
        gte(invoices.issueDate, startDate),
      ),
    );
  for (const row of issued) {
    const bucket = row.issueDate ? buckets.get(monthKey(row.issueDate)) : null;
    if (!bucket) continue;
    const amount = toBase(row.totalMinor ?? 0n, row.currency, row.fxRateToBase);
    if (amount === null) {
      unconvertibleCount += 1;
      continue;
    }
    bucket.invoiced = bucket.invoiced.add(amount);
  }

  const received = await db
    .select({
      paidAt: payments.paidAt,
      amountInInvoiceCurrencyMinor: payments.amountInInvoiceCurrencyMinor,
      invoiceCurrency: invoices.currency,
      fxRateToBase: invoices.fxRateToBase,
    })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(
      and(
        eq(payments.organizationId, organizationId),
        isNull(payments.deletedAt),
        gte(payments.paidAt, start),
      ),
    );
  for (const row of received) {
    const bucket = buckets.get(monthKey(row.paidAt));
    if (!bucket) continue;
    const amount = toBase(
      row.amountInInvoiceCurrencyMinor ?? 0n,
      row.invoiceCurrency,
      row.fxRateToBase,
    );
    if (amount === null) {
      unconvertibleCount += 1;
      continue;
    }
    bucket.collected = bucket.collected.add(amount);
  }

  return { months: [...buckets.values()], unconvertibleCount };
}

export interface StatusBreakdownRow {
  status: string;
  count: number;
  total: Money; // document totals, base currency
  outstanding: Money; // total - paid, base currency (open statuses only)
}

/** Per-status counts and base-currency totals; reconciles with the overview. */
export async function getStatusBreakdown(
  db: Database,
  organizationId: string,
): Promise<{ rows: StatusBreakdownRow[]; unconvertibleCount: number }> {
  const base = await orgBaseCurrency(db, organizationId);
  const toBase = baseConverter(base);

  const rows = await db
    .select({
      status: invoices.status,
      currency: invoices.currency,
      fxRateToBase: invoices.fxRateToBase,
      totalMinor: invoices.totalMinor,
      amountPaidMinor: invoices.amountPaidMinor,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        isNull(invoices.deletedAt),
      ),
    );

  const byStatus = new Map<string, StatusBreakdownRow>();
  let unconvertibleCount = 0;
  for (const row of rows) {
    const entry = byStatus.get(row.status) ?? {
      status: row.status,
      count: 0,
      total: Money.zero(base),
      outstanding: Money.zero(base),
    };
    entry.count += 1;
    const total = toBase(row.totalMinor ?? 0n, row.currency, row.fxRateToBase);
    const remaining = toBase(
      (row.totalMinor ?? 0n) - (row.amountPaidMinor ?? 0n),
      row.currency,
      row.fxRateToBase,
    );
    if (total === null || remaining === null) {
      unconvertibleCount += 1;
    } else {
      entry.total = entry.total.add(total);
      if (OPEN_STATUSES.has(row.status)) {
        entry.outstanding = entry.outstanding.add(remaining);
      }
    }
    byStatus.set(row.status, entry);
  }
  const order = ["draft", "sent", "partial", "overdue", "paid", "void"];
  return {
    rows: [...byStatus.values()].sort(
      (a, b) => order.indexOf(a.status) - order.indexOf(b.status),
    ),
    unconvertibleCount,
  };
}

export interface AgingBucket {
  /** "current" | "1-30" | "31-60" | "61-90" | "90+" */
  bucket: string;
  count: number;
  amount: Money;
}

/** Receivables aging: open balances bucketed by days past due. */
export async function getAgingBuckets(
  db: Database,
  organizationId: string,
  today = new Date().toISOString().slice(0, 10),
): Promise<{ buckets: AgingBucket[]; unconvertibleCount: number }> {
  const base = await orgBaseCurrency(db, organizationId);
  const toBase = baseConverter(base);
  const defs = ["current", "1-30", "31-60", "61-90", "90+"];
  const buckets = new Map<string, AgingBucket>(
    defs.map((b) => [b, { bucket: b, count: 0, amount: Money.zero(base) }]),
  );
  let unconvertibleCount = 0;

  const rows = await db
    .select({
      dueDate: invoices.dueDate,
      currency: invoices.currency,
      fxRateToBase: invoices.fxRateToBase,
      totalMinor: invoices.totalMinor,
      amountPaidMinor: invoices.amountPaidMinor,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        isNull(invoices.deletedAt),
        inArray(invoices.status, ["sent", "partial", "overdue"]),
      ),
    );
  const todayMs = new Date(`${today}T00:00:00Z`).getTime();
  for (const row of rows) {
    const remaining = toBase(
      (row.totalMinor ?? 0n) - (row.amountPaidMinor ?? 0n),
      row.currency,
      row.fxRateToBase,
    );
    if (remaining === null) {
      unconvertibleCount += 1;
      continue;
    }
    const daysPast = row.dueDate
      ? Math.floor(
          (todayMs - new Date(`${row.dueDate}T00:00:00Z`).getTime()) / 86_400_000,
        )
      : 0;
    const key =
      daysPast <= 0
        ? "current"
        : daysPast <= 30
          ? "1-30"
          : daysPast <= 60
            ? "31-60"
            : daysPast <= 90
              ? "61-90"
              : "90+";
    const bucket = buckets.get(key)!;
    bucket.count += 1;
    bucket.amount = bucket.amount.add(remaining);
  }
  return { buckets: [...buckets.values()], unconvertibleCount };
}

export interface TopCustomerRow {
  customerId: string;
  name: string;
  billed: Money; // issued document totals, base currency
  outstanding: Money;
}

/** Customers ranked by outstanding balance (then lifetime billed). */
export async function getTopCustomers(
  db: Database,
  organizationId: string,
  limit = 5,
): Promise<{ rows: TopCustomerRow[]; unconvertibleCount: number }> {
  const base = await orgBaseCurrency(db, organizationId);
  const toBase = baseConverter(base);

  const rows = await db
    .select({
      customerId: invoices.customerId,
      name: customers.name,
      status: invoices.status,
      currency: invoices.currency,
      fxRateToBase: invoices.fxRateToBase,
      totalMinor: invoices.totalMinor,
      amountPaidMinor: invoices.amountPaidMinor,
    })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        isNull(invoices.deletedAt),
        isNotNull(invoices.issuedAt),
        ne(invoices.status, "void"),
      ),
    );

  const byCustomer = new Map<string, TopCustomerRow>();
  let unconvertibleCount = 0;
  for (const row of rows) {
    const entry = byCustomer.get(row.customerId) ?? {
      customerId: row.customerId,
      name: row.name,
      billed: Money.zero(base),
      outstanding: Money.zero(base),
    };
    const total = toBase(row.totalMinor ?? 0n, row.currency, row.fxRateToBase);
    const remaining = toBase(
      (row.totalMinor ?? 0n) - (row.amountPaidMinor ?? 0n),
      row.currency,
      row.fxRateToBase,
    );
    if (total === null || remaining === null) {
      unconvertibleCount += 1;
    } else {
      entry.billed = entry.billed.add(total);
      if (OPEN_STATUSES.has(row.status)) {
        entry.outstanding = entry.outstanding.add(remaining);
      }
    }
    byCustomer.set(row.customerId, entry);
  }
  const ranked = [...byCustomer.values()].sort((a, b) => {
    const byOutstanding = b.outstanding.compare(a.outstanding);
    return byOutstanding !== 0 ? byOutstanding : b.billed.compare(a.billed);
  });
  return { rows: ranked.slice(0, limit), unconvertibleCount };
}

/** Collected in the current calendar month, base currency (tile). */
export async function getCollectedThisMonth(
  db: Database,
  organizationId: string,
): Promise<{ amount: Money; unconvertibleCount: number }> {
  const { months, unconvertibleCount } = await getCashFlow(db, organizationId, 1);
  return { amount: months[0].collected, unconvertibleCount };
}
