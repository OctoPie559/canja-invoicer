import { and, count, eq, isNull } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import {
  customers,
  invoices,
  organizationSettings,
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
