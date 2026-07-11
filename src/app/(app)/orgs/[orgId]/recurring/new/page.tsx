import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { can } from "@/lib/authz/permissions";
import { requireMembership } from "@/lib/transport/org";
import { RecurringForm } from "@/components/recurring-form";
import { Card, CardContent } from "@/components/ui/card";
import { loadInvoiceFormData } from "../../invoices/form-data";

export default async function NewRecurringPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { role } = await requireMembership(orgId);
  if (!can(role, "recurring.manage")) redirect(`/orgs/${orgId}/recurring`);
  const formData = await loadInvoiceFormData(orgId);

  return (
    <div className="space-y-4">
      <Link
        href={`/orgs/${orgId}/recurring`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        All schedules
      </Link>
      <h1 className="font-heading text-xl font-semibold text-foreground">
        New recurring schedule
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
          />
        </CardContent>
      </Card>
    </div>
  );
}
