import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { listTaxRates } from "@/lib/services/settings";
import { requireMembership } from "@/lib/transport/org";
import { TaxRatesSettings } from "@/components/invoice-settings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function TaxRatesSettingsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { role } = await requireMembership(orgId);
  const taxRates = await listTaxRates(getDb(), orgId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-base">Tax rates</CardTitle>
        <CardDescription>
          Named rates offered on invoice lines. Rates are copied onto lines
          when you use them, so editing a rate never rewrites history.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TaxRatesSettings
          organizationId={orgId}
          taxRates={taxRates}
          canManage={can(role, "tax_rate.manage")}
        />
      </CardContent>
    </Card>
  );
}
