import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { listCustomers } from "@/lib/services/customers";
import { requireMembership } from "@/lib/transport/org";
import { CustomerListPane } from "@/components/customer-list-pane";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Index of the master-detail view. With customers present, the first one is
 * pre-selected (redirect) so the right pane is never empty. `?list=1` skips
 * the redirect — it's how the mobile back-link reaches the bare list
 * without looping.
 */
export default async function CustomersIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ list?: string }>;
}) {
  const { orgId } = await params;
  const { list } = await searchParams;
  const { role } = await requireMembership(orgId);
  const customers = await listCustomers(getDb(), orgId);

  if (customers.length > 0 && list !== "1") {
    redirect(`/orgs/${orgId}/customers/${customers[0].id}`);
  }

  return (
    <>
      {/* the layout's list pane is hidden below lg; show it here instead */}
      <Card className="overflow-hidden py-0 lg:hidden">
        <CustomerListPane
          organizationId={orgId}
          customers={customers.map((c) => ({
            id: c.id,
            name: c.name,
            email: c.email,
          }))}
          canCreate={can(role, "customer.create")}
        />
      </Card>
      <Card className="hidden lg:block">
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          {customers.length === 0
            ? "No customers yet — create your first one with the + button."
            : "Select a customer from the list."}
        </CardContent>
      </Card>
    </>
  );
}
