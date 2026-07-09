import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { can } from "@/lib/authz/permissions";
import { requireMembership } from "@/lib/transport/org";
import { EstimateForm } from "@/components/estimate-form";
import { Card, CardContent } from "@/components/ui/card";
import { loadInvoiceFormData } from "../../invoices/form-data";

export default async function NewEstimatePage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { role } = await requireMembership(orgId);
  if (!can(role, "estimate.create")) redirect(`/orgs/${orgId}/estimates`);
  const formData = await loadInvoiceFormData(orgId);

  return (
    <div className="space-y-4">
      <Link
        href={`/orgs/${orgId}/estimates`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        All estimates
      </Link>
      <h1 className="font-heading text-xl font-semibold text-foreground">
        New estimate
      </h1>
      <Card>
        <CardContent className="pt-6">
          <EstimateForm
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
