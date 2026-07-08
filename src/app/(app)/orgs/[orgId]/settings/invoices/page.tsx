import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { getInvoiceSettings, listTaxRates } from "@/lib/services/settings";
import { requireMembership } from "@/lib/transport/org";
import {
  DocNumberingSettings,
  InvoiceDefaultsSettings,
  InvoiceNumberingSettings,
} from "@/components/invoice-settings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function InvoiceSettingsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { role } = await requireMembership(orgId);
  const db = getDb();
  const [settings, taxRates] = await Promise.all([
    getInvoiceSettings(db, orgId),
    listTaxRates(db, orgId),
  ]);
  const canManage = can(role, "settings.update");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            Invoice numbering
          </CardTitle>
          <CardDescription>
            The prefix and counter behind sequential display numbers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InvoiceNumberingSettings
            organizationId={orgId}
            settings={settings}
            canManage={canManage}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            Estimate & credit-note numbering
          </CardTitle>
          <CardDescription>
            Independent counters for quotes and corrections.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <DocNumberingSettings
            organizationId={orgId}
            doc="estimate"
            label="Estimate"
            prefix={settings.estimatePrefix}
            nextNumber={settings.estimateNextNumber}
            version={settings.version}
            canManage={canManage}
          />
          <div className="border-t pt-4">
            <DocNumberingSettings
              organizationId={orgId}
              doc="credit_note"
              label="Credit note"
              prefix={settings.creditNotePrefix}
              nextNumber={settings.creditNoteNextNumber}
              version={settings.version}
              canManage={canManage}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            Invoice defaults
          </CardTitle>
          <CardDescription>
            Prefilled into every new invoice — tax rate on new lines, customer
            notes, and terms & conditions. Editable per document.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InvoiceDefaultsSettings
            organizationId={orgId}
            settings={settings}
            taxRates={taxRates}
            canManage={canManage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
