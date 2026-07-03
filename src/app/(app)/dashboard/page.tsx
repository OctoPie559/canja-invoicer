import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { listUserOrganizations } from "@/lib/services/organizations";
import { requireSession } from "@/lib/transport/session";
import { CreateOrgForm } from "@/components/forms";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function DashboardPage() {
  const session = await requireSession();
  const orgs = await listUserOrganizations(getDb(), session.user.id);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-4 font-heading text-xl font-semibold text-foreground">
          Your organizations
        </h1>
        {orgs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No organizations yet — create one below to start invoicing.
          </p>
        ) : (
          <Card className="py-0">
            <ul className="divide-y">
              {orgs.map((org) => (
                <li key={org.id}>
                  <Link
                    href={`/orgs/${org.id}`}
                    className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/50"
                  >
                    <span className="font-medium text-foreground">
                      {org.name}
                    </span>
                    <Badge variant="secondary">{org.role}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            New organization
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CreateOrgForm />
        </CardContent>
      </Card>
    </div>
  );
}
