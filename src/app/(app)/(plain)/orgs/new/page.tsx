import { getDb } from "@/lib/db/client";
import { listUserOrganizations } from "@/lib/services/organizations";
import { requireSession } from "@/lib/transport/session";
import { CreateOrgForm } from "@/components/forms";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function NewOrganizationPage() {
  const session = await requireSession();
  const orgs = await listUserOrganizations(getDb(), session.user.id);
  const firstOrg = orgs.length === 0;

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle className="font-heading text-lg">
          {firstOrg ? "Welcome — set up your workspace" : "New organization"}
        </CardTitle>
        <CardDescription>
          {firstOrg
            ? "An organization holds your customers, products, and invoices. Create yours to start invoicing."
            : "Create another workspace with its own customers, invoices, and team."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CreateOrgForm />
      </CardContent>
    </Card>
  );
}
