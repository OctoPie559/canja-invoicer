import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import {
  getCustomer,
  getCustomerTimeline,
  getCustomerVersions,
} from "@/lib/services/customers";
import { requireMembership } from "@/lib/transport/org";
import { deleteCustomerAction } from "@/app/actions/customers";
import { CustomerForm } from "@/components/customer-form";
import { ActivityTimeline } from "@/components/activity-timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; customerId: string }>;
}) {
  const { orgId, customerId } = await params;
  const { role } = await requireMembership(orgId);
  const db = getDb();

  const customer = await getCustomer(db, orgId, customerId);
  if (!customer) notFound();
  const [timeline, versions] = await Promise.all([
    getCustomerTimeline(db, orgId, customerId),
    getCustomerVersions(db, orgId, customerId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold text-foreground">
          {customer.name}
        </h1>
        {can(role, "customer.delete") && (
          <form
            action={deleteCustomerAction.bind(
              null,
              orgId,
              customerId,
              customer.version,
            )}
          >
            <Button variant="destructive" size="sm" type="submit">
              Delete
            </Button>
          </form>
        )}
      </div>

      {can(role, "customer.update") ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomerForm organizationId={orgId} customer={customer} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd>{customer.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Phone</dt>
                <dd>{customer.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Address</dt>
                <dd>
                  {[customer.addressLine1, customer.addressLine2, customer.city, customer.country]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Notes</dt>
                <dd>{customer.notes ?? "—"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityTimeline entries={timeline} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            Version history
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2">
                  <Badge variant="secondary">v{v.version}</Badge>
                  {(v.data as { name?: string }).name}
                </span>
                <span className="text-muted-foreground">
                  {v.changedAt.toISOString().slice(0, 16).replace("T", " ")}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
