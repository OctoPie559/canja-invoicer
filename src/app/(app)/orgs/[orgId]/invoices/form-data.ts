import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { subscriptions } from "@/lib/db/schema";
import { Money } from "@/lib/domain/money";
import type { Plan } from "@/lib/authz/entitlements";
import { PLAN_ENTITLEMENTS } from "@/lib/authz/entitlements";
import { listCustomers } from "@/lib/services/customers";
import { listProducts } from "@/lib/services/products";
import { getInvoiceSettings, listTaxRates } from "@/lib/services/settings";
import { SUPPORTED_CURRENCIES } from "@/lib/validation/currencies";
import type { InvoiceFormProps } from "@/components/invoice-form";

/**
 * Everything the invoice builder needs, shaped for the client component:
 * catalog prices as decimal strings (client re-parses through Money), tax
 * defaults resolved to basis points, and the currency list narrowed to
 * base-only on the free plan (multiCurrency is Pro; the service enforces
 * it — this narrows the UI to match).
 */
export async function loadInvoiceFormData(
  organizationId: string,
): Promise<Omit<InvoiceFormProps, "organizationId" | "invoice">> {
  const db = getDb();
  const [customers, products, taxRates, settings, [sub]] = await Promise.all([
    listCustomers(db, organizationId),
    listProducts(db, organizationId),
    listTaxRates(db, organizationId),
    getInvoiceSettings(db, organizationId),
    db
      .select({ plan: subscriptions.plan })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, organizationId))
      .limit(1),
  ]);

  const plan = (sub?.plan ?? "free") as Plan;
  const rateByTaxId = new Map(taxRates.map((t) => [t.id, t.rateBps]));

  return {
    customers: customers.map((c) => ({
      id: c.id,
      name: c.name,
      paymentTermsDays: c.paymentTermsDays,
    })),
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      unitPrice: Money.fromMinor(p.unitPriceMinor, p.currency).toDecimalString(),
      currency: p.currency,
      defaultTaxRateBps: p.defaultTaxRateId
        ? (rateByTaxId.get(p.defaultTaxRateId) ?? null)
        : null,
    })),
    taxRates,
    baseCurrency: settings.baseCurrency,
    allowedCurrencies: PLAN_ENTITLEMENTS[plan].multiCurrency
      ? [...SUPPORTED_CURRENCIES]
      : [settings.baseCurrency],
    defaultPaymentTermsDays: settings.defaultPaymentTermsDays,
    defaultLineTaxRateBps: settings.defaultTaxRateId
      ? (rateByTaxId.get(settings.defaultTaxRateId) ?? 0)
      : 0,
    defaultNotes: settings.defaultInvoiceNotes,
    defaultTerms: settings.defaultInvoiceTerms,
  };
}
