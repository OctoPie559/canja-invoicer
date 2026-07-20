import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { listContacts } from "@/lib/services/contacts";
import { customerLogoUrl, getCustomer } from "@/lib/services/customers";
import { requireMembership } from "@/lib/transport/org";
import { CustomerForm } from "@/components/customer-form";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ orgId: string; customerId: string }>;
}) {
  const { orgId, customerId } = await params;
  const { role } = await requireMembership(orgId);
  if (!can(role, "customer.update")) notFound();

  const db = getDb();
  const customer = await getCustomer(db, orgId, customerId);
  if (!customer) notFound();
  const contacts = await listContacts(db, orgId, customerId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">
          Edit {customer.name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <CustomerForm
          organizationId={orgId}
          customer={customer}
          contacts={contacts}
          logoUrl={customerLogoUrl(customer.logoKey)}
          cancelHref={`/orgs/${orgId}/customers/${customerId}`}
        />
      </CardContent>
    </Card>
  );
}
