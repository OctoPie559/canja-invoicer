import { and, eq, ilike, isNull } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { customers, invoices } from "@/lib/db/schema";
import type { IntentParams } from "@/lib/validation/ask";
import { Money } from "@/lib/domain/money";
import {
  getAgingBuckets,
  getFinancialOverview,
  getRevenueForRange,
  getTopCustomers,
} from "@/lib/services/reporting";
import { listInvoices } from "@/lib/services/invoices";
import { listInvoicePayments } from "@/lib/services/payments";
import { periodLabel, resolvePeriod } from "./dates";

/**
 * Lane 1 intent execution: each intent maps to a predefined, org-scoped
 * query (mostly the existing reporting services). Results are rendered to
 * compact labeled text — every money figure is a server-side Money string,
 * every row carries a [n] citation marker whose link is built HERE from the
 * query row, never from model output. The LLM downstream only rephrases.
 */

export interface Citation {
  type: "invoice" | "customer";
  id: string;
  label: string;
}

export interface IntentResult {
  /** Compact data block for the answer model. */
  data: string;
  citations: Citation[];
  /**
   * Deterministic reply that SKIPS the answer model (canned refusals,
   * entity disambiguation) — honest and free.
   */
  directAnswer?: string;
}

const CANT_ANSWER =
  "I can't answer that one yet. I can help with things like: your financial overview, outstanding or overdue invoices, what you invoiced or collected in a period, a specific invoice's payment status, receivables aging, and your top customers by balance.";

// ---- deterministic entity resolution (never LLM-guessed ids) ---------------

/** LIKE metacharacters in an extracted ref are literals, not wildcards. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

async function resolveCustomer(db: Database, organizationId: string, ref: string) {
  const matches = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(
      and(
        eq(customers.organizationId, organizationId),
        isNull(customers.deletedAt),
        ilike(customers.name, `%${escapeLike(ref)}%`),
      ),
    )
    .limit(5);
  return matches;
}

/** "INV-0047", "0047", "invoice 47" all find INV-0047 (numeric-suffix match). */
async function resolveInvoice(db: Database, organizationId: string, ref: string) {
  const digits = ref.replace(/\D/g, "");
  const rows = await db
    .select({ id: invoices.id, displayNumber: invoices.displayNumber })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        isNull(invoices.deletedAt),
        digits
          ? ilike(invoices.displayNumber, `%${digits}`)
          : ilike(invoices.displayNumber, `%${escapeLike(ref)}%`),
      ),
    )
    .limit(10);
  const exact = rows.filter(
    (r) =>
      r.displayNumber?.toLowerCase() === ref.toLowerCase() ||
      (digits &&
        parseInt(r.displayNumber?.replace(/\D/g, "") ?? "", 10) ===
          parseInt(digits, 10)),
  );
  return exact.length > 0 ? exact : rows;
}

// ---- formatting helpers -----------------------------------------------------

const fmt = (m: Money) => m.toString();

function unconvertibleNote(count: number): string {
  return count > 0
    ? `\nNote: ${count} foreign-currency record(s) lack a stored exchange rate and are excluded from these totals.`
    : "";
}

// ---- the runner -------------------------------------------------------------

export async function runIntent(
  db: Database,
  organizationId: string,
  resolved: IntentParams,
  now: Date = new Date(),
): Promise<IntentResult> {
  switch (resolved.intent) {
    case "financial_overview": {
      const o = await getFinancialOverview(db, organizationId);
      return {
        data:
          `Financial overview (base currency ${o.baseCurrency}):\n` +
          `Outstanding (owed to you): ${fmt(o.outstanding)} across ${o.openInvoiceCount} open invoice(s)\n` +
          `Overdue: ${fmt(o.overdue)} across ${o.overdueCount} invoice(s)\n` +
          `Collected (all time): ${fmt(o.collected)}\n` +
          `Drafts: ${o.draftCount} · Customers: ${o.customerCount} · Products: ${o.productCount}` +
          unconvertibleNote(o.unconvertibleCount),
        citations: [],
      };
    }

    case "outstanding_balance": {
      if (!resolved.params.customerRef) {
        const o = await getFinancialOverview(db, organizationId);
        return {
          data:
            `Total outstanding (owed to you): ${fmt(o.outstanding)} across ${o.openInvoiceCount} open invoice(s).\n` +
            `Of that, overdue: ${fmt(o.overdue)}.` +
            unconvertibleNote(o.unconvertibleCount),
          citations: [],
        };
      }
      const matches = await resolveCustomer(
        db,
        organizationId,
        resolved.params.customerRef,
      );
      if (matches.length === 0) {
        return {
          data: "",
          citations: [],
          directAnswer: `I couldn't find a customer matching “${resolved.params.customerRef}”.`,
        };
      }
      if (matches.length > 1) {
        return {
          data: "",
          citations: matches.map((m) => ({
            type: "customer",
            id: m.id,
            label: m.name,
          })),
          directAnswer: `I found ${matches.length} customers matching “${resolved.params.customerRef}”: ${matches.map((m) => m.name).join(", ")}. Which one did you mean?`,
        };
      }
      const customer = matches[0];
      // getTopCustomers already computes effective balances (credits included)
      // with the org's FX discipline — reuse it and pick the customer's row.
      const { rows, unconvertibleCount } = await getTopCustomers(
        db,
        organizationId,
        1000,
      );
      const row = rows.find((r) => r.customerId === customer.id);
      const data = row
        ? `Customer ${customer.name} [1]:\nOutstanding balance: ${fmt(row.outstanding)}\nLifetime billed: ${fmt(row.billed)}` +
          unconvertibleNote(unconvertibleCount)
        : `Customer ${customer.name} [1] has no outstanding balance (nothing owed).`;
      return {
        data,
        citations: [{ type: "customer", id: customer.id, label: customer.name }],
      };
    }

    case "overdue_list": {
      const rows = await listInvoices(db, organizationId, { status: "overdue" });
      const top = rows.slice(0, resolved.params.limit);
      if (top.length === 0) {
        return { data: "No overdue invoices. Nothing is past due.", citations: [] };
      }
      const lines = top.map((r, i) => {
        const balance = Money.fromMinor(
          (r.totalMinor ?? 0n) - (r.amountPaidMinor ?? 0n),
          r.currency,
        );
        return `[${i + 1}] ${r.displayNumber} · ${r.customerName} · due ${r.dueDate} · balance ${fmt(balance)}`;
      });
      return {
        data: `Overdue invoices (${rows.length} total, showing ${top.length}):\n${lines.join("\n")}`,
        citations: top.map((r) => ({
          type: "invoice",
          id: r.id,
          label: r.displayNumber ?? "invoice",
        })),
      };
    }

    case "revenue_by_period": {
      const range = resolvePeriod(resolved.params.period, now);
      const r = await getRevenueForRange(
        db,
        organizationId,
        range,
        resolved.params.metric,
      );
      const verb =
        resolved.params.metric === "invoiced"
          ? `invoiced across ${r.count} issued invoice(s)`
          : `collected across ${r.count} payment(s)`;
      return {
        data:
          `Period ${periodLabel(range)} (base currency ${r.baseCurrency}):\n` +
          `Total ${resolved.params.metric}: ${fmt(r.total)} — ${verb}.` +
          unconvertibleNote(r.unconvertibleCount),
        citations: [],
      };
    }

    case "payment_status": {
      const matches = await resolveInvoice(
        db,
        organizationId,
        resolved.params.invoiceRef,
      );
      if (matches.length === 0) {
        return {
          data: "",
          citations: [],
          directAnswer: `I couldn't find an invoice matching “${resolved.params.invoiceRef}”.`,
        };
      }
      if (matches.length > 1) {
        return {
          data: "",
          citations: matches.slice(0, 5).map((m) => ({
            type: "invoice",
            id: m.id,
            label: m.displayNumber ?? "invoice",
          })),
          directAnswer: `I found several invoices matching “${resolved.params.invoiceRef}”: ${matches
            .slice(0, 5)
            .map((m) => m.displayNumber)
            .join(", ")}. Which one did you mean?`,
        };
      }
      const inv = matches[0];
      const [detail] = await db
        .select({
          id: invoices.id,
          displayNumber: invoices.displayNumber,
          status: invoices.status,
          currency: invoices.currency,
          issueDate: invoices.issueDate,
          dueDate: invoices.dueDate,
          totalMinor: invoices.totalMinor,
          amountPaidMinor: invoices.amountPaidMinor,
          customerId: invoices.customerId,
          customerName: customers.name,
        })
        .from(invoices)
        .innerJoin(customers, eq(customers.id, invoices.customerId))
        .where(
          and(eq(invoices.id, inv.id), eq(invoices.organizationId, organizationId)),
        )
        .limit(1);
      const pays = await listInvoicePayments(db, organizationId, inv.id);
      const total = Money.fromMinor(detail.totalMinor ?? 0n, detail.currency);
      const paid = Money.fromMinor(detail.amountPaidMinor ?? 0n, detail.currency);
      const balance = Money.fromMinor(
        (detail.totalMinor ?? 0n) - (detail.amountPaidMinor ?? 0n),
        detail.currency,
      );
      const payLines =
        pays.length === 0
          ? "No payments recorded."
          : pays
              .map(
                (p) =>
                  `- ${fmt(Money.fromMinor(p.amountMinor ?? 0n, p.currency))} via ${p.method} on ${p.paidAt instanceof Date ? p.paidAt.toISOString().slice(0, 10) : p.paidAt}`,
              )
              .join("\n");
      return {
        data:
          `Invoice ${detail.displayNumber} [1] — ${detail.customerName} [2]:\n` +
          `Status: ${detail.status} · Issued: ${detail.issueDate} · Due: ${detail.dueDate}\n` +
          `Total: ${fmt(total)} · Paid: ${fmt(paid)} · Balance: ${fmt(balance)}\n` +
          `Payments:\n${payLines}`,
        citations: [
          { type: "invoice", id: detail.id, label: detail.displayNumber ?? "invoice" },
          { type: "customer", id: detail.customerId, label: detail.customerName },
        ],
      };
    }

    case "top_customers": {
      // fetch wide, then rank by the requested key — getTopCustomers ranks by
      // outstanding, so slicing before a billed re-sort would drop rows
      const { rows, unconvertibleCount } = await getTopCustomers(
        db,
        organizationId,
        1000,
      );
      const ranked = (
        resolved.params.by === "billed"
          ? [...rows].sort((a, b) =>
              b.billed.amountMinor > a.billed.amountMinor ? 1 : -1,
            )
          : rows
      ).slice(0, resolved.params.limit);
      if (ranked.length === 0) {
        return { data: "No customers with billed invoices yet.", citations: [] };
      }
      const lines = ranked.map(
        (r, i) =>
          `[${i + 1}] ${r.name} · outstanding ${fmt(r.outstanding)} · lifetime billed ${fmt(r.billed)}`,
      );
      return {
        data:
          `Top customers by ${resolved.params.by} (base currency):\n${lines.join("\n")}` +
          unconvertibleNote(unconvertibleCount),
        citations: ranked.map((r) => ({
          type: "customer",
          id: r.customerId,
          label: r.name,
        })),
      };
    }

    case "aging_breakdown": {
      const { buckets, unconvertibleCount } = await getAgingBuckets(
        db,
        organizationId,
      );
      const lines = buckets.map(
        (b) =>
          `${b.bucket === "current" ? "Not yet due" : `${b.bucket} days overdue`}: ${fmt(b.amount)} (${b.count} invoice(s))`,
      );
      return {
        data: `Receivables aging (base currency):\n${lines.join("\n")}` +
          unconvertibleNote(unconvertibleCount),
        citations: [],
      };
    }

    case "unsupported":
      return {
        data: "",
        citations: [],
        directAnswer:
          resolved.params.reason === "ambiguous"
            ? "I'm not sure what you're asking — could you rephrase? For example: “who owes me money?”, “what did I collect last month?”, or “what's the status of INV-0047?”"
            : CANT_ANSWER,
      };
  }
}
