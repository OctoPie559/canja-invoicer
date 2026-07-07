import { getDb } from "@/lib/db/client";
import { can } from "@/lib/authz/permissions";
import { PAYMENT_TERMS_PRESETS } from "@/lib/domain/payment-terms";
import { getInvoiceSettings } from "@/lib/services/settings";
import { requireMembership } from "@/lib/transport/org";
import { PaymentTermsDefaultSettings } from "@/components/invoice-settings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function PaymentTermsSettingsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { role } = await requireMembership(orgId);
  const settings = await getInvoiceSettings(getDb(), orgId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-base">Payment terms</CardTitle>
        <CardDescription>
          How due dates are derived. Terms resolve most-specific first:
          invoice → customer → this organization default.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <PaymentTermsDefaultSettings
          organizationId={orgId}
          settings={settings}
          canManage={can(role, "settings.update")}
        />
        <div className="border-t pt-4">
          <h3 className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Available terms
          </h3>
          <ul className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
            {PAYMENT_TERMS_PRESETS.map((p) => (
              <li key={p.days}>
                {p.label}
                {p.days > 0 && (
                  <span className="text-xs"> — due {p.days} days after issue</span>
                )}
              </li>
            ))}
            <li>
              Custom<span className="text-xs"> — pick any due date directly</span>
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
