import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { listCustomersWithPrimaryContact } from "@/lib/services/customers";
import { requireMembership } from "@/lib/transport/org";
import { CustomerListPane } from "@/components/customer-list-pane";
import { Card } from "@/components/ui/card";

/**
 * Master-detail: the customer list stays on the left while the right pane
 * shows whatever is selected (detail tabs, new/edit forms, or the prompt).
 */
export default async function CustomersLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { role } = await requireMembership(orgId);
  const customers = await listCustomersWithPrimaryContact(getDb(), orgId);

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="hidden h-[calc(100vh-8.5rem)] overflow-hidden py-0 lg:block">
        <CustomerListPane
          organizationId={orgId}
          customers={customers}
          canCreate={can(role, "customer.create")}
        />
      </Card>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
