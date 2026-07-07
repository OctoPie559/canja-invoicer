import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { can } from "@/lib/authz/permissions";
import { requireMembership } from "@/lib/transport/org";
import { InvoiceForm } from "@/components/invoice-form";
import { Card, CardContent } from "@/components/ui/card";
import { loadInvoiceFormData } from "../form-data";

export default async function NewInvoicePage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { role } = await requireMembership(orgId);
  if (!can(role, "invoice.create")) redirect(`/orgs/${orgId}/invoices`);

  const formData = await loadInvoiceFormData(orgId);

  return (
    <div className="space-y-4">
      <Link
        href={`/orgs/${orgId}/invoices`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        All invoices
      </Link>
      <h1 className="font-heading text-xl font-semibold text-foreground">
        New invoice
      </h1>
      {formData.customers.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You need a customer before you can invoice.{" "}
            <Link
              href={`/orgs/${orgId}/customers/new`}
              className="font-medium text-foreground underline"
            >
              Add your first customer
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <InvoiceForm organizationId={orgId} {...formData} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
