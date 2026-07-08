import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { Money } from "@/lib/domain/money";
import {
  isEstimateEditable,
  type EstimateStatus,
} from "@/lib/domain/estimate-status";
import { getEstimate } from "@/lib/services/estimates";
import { requireMembership } from "@/lib/transport/org";
import { EstimateForm } from "@/components/estimate-form";
import { Card, CardContent } from "@/components/ui/card";
import { loadInvoiceFormData } from "../../../invoices/form-data";

export default async function EditEstimatePage({
  params,
}: {
  params: Promise<{ orgId: string; estimateId: string }>;
}) {
  const { orgId, estimateId } = await params;
  const { role } = await requireMembership(orgId);
  if (!can(role, "estimate.update")) redirect(`/orgs/${orgId}/estimates`);

  const estimate = await getEstimate(getDb(), orgId, estimateId);
  if (!estimate) notFound();
  if (!isEstimateEditable(estimate.status as EstimateStatus)) {
    redirect(`/orgs/${orgId}/estimates/${estimateId}`);
  }
  const formData = await loadInvoiceFormData(orgId);

  return (
    <div className="space-y-4">
      <Link
        href={`/orgs/${orgId}/estimates/${estimateId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Back to draft
      </Link>
      <h1 className="font-heading text-xl font-semibold text-foreground">
        Edit draft
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
            estimate={{
              id: estimate.id,
              version: estimate.version,
              customerId: estimate.customerId,
              currency: estimate.currency,
              issueDate: estimate.issueDate,
              expiryDate: estimate.expiryDate,
              notes: estimate.notes,
              terms: estimate.terms,
              lines: estimate.lines.map((l) => ({
                productId: l.productId,
                description: l.description,
                quantity: l.quantity,
                unitPrice: Money.fromMinor(
                  l.unitPriceMinor ?? 0n,
                  estimate.currency,
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
