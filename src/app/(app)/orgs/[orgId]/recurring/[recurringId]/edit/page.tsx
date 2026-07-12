import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { Money } from "@/lib/domain/money";
import { getRecurring, lastInvoicedDate } from "@/lib/services/recurring";
import { requireMembership } from "@/lib/transport/org";
import { RecurringForm } from "@/components/recurring-form";
import { Card, CardContent } from "@/components/ui/card";
import { loadInvoiceFormData } from "../../../invoices/form-data";

export default async function EditRecurringPage({
  params,
}: {
  params: Promise<{ orgId: string; recurringId: string }>;
}) {
  const { orgId, recurringId } = await params;
  const { role } = await requireMembership(orgId);
  if (!can(role, "recurring.manage")) redirect(`/orgs/${orgId}/recurring`);

  const db = getDb();
  const schedule = await getRecurring(db, orgId, recurringId);
  if (!schedule) notFound();
  if (schedule.status === "ended") {
    redirect(`/orgs/${orgId}/recurring/${recurringId}`);
  }
  const [formData, lastBilledDate] = await Promise.all([
    loadInvoiceFormData(orgId),
    lastInvoicedDate(db, orgId, recurringId),
  ]);

  return (
    <div className="space-y-4">
      <Link
        href={`/orgs/${orgId}/recurring/${recurringId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Back to schedule
      </Link>
      <h1 className="font-heading text-xl font-semibold text-foreground">
        Edit schedule
      </h1>
      <Card>
        <CardContent className="pt-6">
          <RecurringForm
            organizationId={orgId}
            customers={formData.customers}
            products={formData.products}
            taxRates={formData.taxRates}
            baseCurrency={formData.baseCurrency}
            allowedCurrencies={formData.allowedCurrencies}
            defaultLineTaxRateBps={formData.defaultLineTaxRateBps}
            lastBilledDate={lastBilledDate}
            schedule={{
              id: schedule.id,
              version: schedule.version,
              customerId: schedule.customerId,
              currency: schedule.currency,
              frequency: schedule.frequency,
              intervalCount: schedule.intervalCount,
              startDate: schedule.nextRunAt
                ? schedule.nextRunAt.toISOString().slice(0, 10)
                : "",
              endDate: schedule.endDate,
              autoIssue: schedule.autoIssue,
              notes: schedule.notes,
              terms: schedule.terms,
              lines: schedule.items.map((l) => ({
                productId: l.productId,
                description: l.description,
                quantity: l.quantity,
                unitPrice: Money.fromMinor(
                  l.unitPriceMinor ?? 0n,
                  schedule.currency,
                ).toDecimalString(),
                discountBps: l.discountBps,
                taxRateBps: l.taxRateBps,
              })),
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
