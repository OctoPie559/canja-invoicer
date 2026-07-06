import { notFound } from "next/navigation";
import { can } from "@/lib/authz/permissions";
import { requireMembership } from "@/lib/transport/org";
import { CustomerForm } from "@/components/customer-form";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function NewCustomerPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { role } = await requireMembership(orgId);
  if (!can(role, "customer.create")) notFound();

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle className="font-heading text-lg">New customer</CardTitle>
      </CardHeader>
      <CardContent>
        <CustomerForm organizationId={orgId} cancelHref={`/orgs/${orgId}/customers`} />
      </CardContent>
    </Card>
  );
}
