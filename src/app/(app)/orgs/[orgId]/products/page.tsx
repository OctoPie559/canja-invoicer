import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { Money } from "@/lib/domain/money";
import { listProducts } from "@/lib/services/products";
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

export default async function ProductsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { role } = await requireMembership(orgId);
  const products = await listProducts(getDb(), orgId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold text-foreground">
          Products & services
        </h1>
        {can(role, "product.create") && (
          <Button asChild>
            <Link href={`/orgs/${orgId}/products/new`}>New product</Link>
          </Button>
        )}
      </div>
      <Card className="py-0">
        <CardContent className="px-0">
          {products.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No products yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/orgs/${orgId}/products/${p.id}`}
                        className="hover:underline"
                      >
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.unitLabel ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Money.fromMinor(p.unitPriceMinor, p.currency).toString()}
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
