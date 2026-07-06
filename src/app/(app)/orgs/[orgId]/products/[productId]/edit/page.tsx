import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { Money } from "@/lib/domain/money";
import { getProduct, listUnitLabels } from "@/lib/services/products";
import { requireMembership } from "@/lib/transport/org";
import { ProductForm } from "@/components/product-form";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ orgId: string; productId: string }>;
}) {
  const { orgId, productId } = await params;
  const { role } = await requireMembership(orgId);
  if (!can(role, "product.update")) notFound();

  const db = getDb();
  const product = await getProduct(db, orgId, productId);
  if (!product) notFound();
  const unitOptions = await listUnitLabels(db, orgId);
  const price = Money.fromMinor(product.unitPriceMinor, product.currency);

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle className="font-heading text-lg">
          Edit {product.name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ProductForm
          organizationId={orgId}
          unitOptions={unitOptions}
          cancelHref={`/orgs/${orgId}/products/${productId}`}
          product={{
            id: product.id,
            version: product.version,
            name: product.name,
            productType: product.productType,
            description: product.description,
            unitLabel: product.unitLabel,
            unitPrice: price.toDecimalString(),
            currency: product.currency,
          }}
        />
      </CardContent>
    </Card>
  );
}
