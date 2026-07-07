import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { Money } from "@/lib/domain/money";
import { isEditable, type InvoiceStatus } from "@/lib/domain/invoice-status";
import { getInvoice } from "@/lib/services/invoices";
import { requireMembership } from "@/lib/transport/org";
import { InvoiceForm } from "@/components/invoice-form";
import { Card, CardContent } from "@/components/ui/card";
import { loadInvoiceFormData } from "../../form-data";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ orgId: string; invoiceId: string }>;
}) {
  const { orgId, invoiceId } = await params;
  const { role } = await requireMembership(orgId);
  if (!can(role, "invoice.update")) redirect(`/orgs/${orgId}/invoices`);

  const invoice = await getInvoice(getDb(), orgId, invoiceId);
  if (!invoice) notFound();
  // issued documents are immutable — there is nothing to edit
  if (!isEditable(invoice.status as InvoiceStatus)) {
    redirect(`/orgs/${orgId}/invoices/${invoiceId}`);
  }

  const formData = await loadInvoiceFormData(orgId);

  return (
    <div className="space-y-4">
      <Link
        href={`/orgs/${orgId}/invoices/${invoiceId}`}
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
          <InvoiceForm
            organizationId={orgId}
            {...formData}
            invoice={{
              id: invoice.id,
              version: invoice.version,
              customerId: invoice.customerId,
              currency: invoice.currency,
              issueDate: invoice.issueDate,
              dueDate: invoice.dueDate,
              notes: invoice.notes,
              terms: invoice.terms,
              lines: invoice.lines.map((l) => ({
                productId: l.productId,
                description: l.description,
                quantity: l.quantity,
                unitPrice: Money.fromMinor(
                  l.unitPriceMinor ?? 0n,
                  invoice.currency,
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
