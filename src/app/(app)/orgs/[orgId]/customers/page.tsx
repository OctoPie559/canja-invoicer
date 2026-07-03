import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { listCustomers } from "@/lib/services/customers";
import { requireMembership } from "@/lib/transport/org";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function CustomersPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { role } = await requireMembership(orgId);
  const customers = await listCustomers(getDb(), orgId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold text-foreground">
          Customers
        </h1>
        {can(role, "customer.create") && (
          <Button asChild>
            <Link href={`/orgs/${orgId}/customers/new`}>New customer</Link>
          </Button>
        )}
      </div>
      <Card className="py-0">
        <CardContent className="px-0">
          {customers.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No customers yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Country</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/orgs/${orgId}/customers/${c.id}`}
                        className="hover:underline"
                      >
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.email ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.city ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.country ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
