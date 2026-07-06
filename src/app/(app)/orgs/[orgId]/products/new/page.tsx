import { notFound } from "next/navigation";
import { can } from "@/lib/authz/permissions";
import { getDb } from "@/lib/db/client";
import { listUnitLabels } from "@/lib/services/products";
import { requireMembership } from "@/lib/transport/org";
import { ProductForm } from "@/components/product-form";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function NewProductPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { role } = await requireMembership(orgId);
  if (!can(role, "product.create")) notFound();
  const unitOptions = await listUnitLabels(getDb(), orgId);

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle className="font-heading text-lg">New product</CardTitle>
      </CardHeader>
      <CardContent>
        <ProductForm organizationId={orgId} unitOptions={unitOptions} cancelHref={`/orgs/${orgId}/products`} />
      </CardContent>
    </Card>
  );
}
