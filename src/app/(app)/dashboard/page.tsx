import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { listUserOrganizations } from "@/lib/services/organizations";
import { requireSession } from "@/lib/transport/session";
import { CreateOrgForm } from "@/components/forms";

export default async function DashboardPage() {
  const session = await requireSession();
  const orgs = await listUserOrganizations(getDb(), session.user.id);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-4 text-xl font-semibold text-neutral-900">
          Your organizations
        </h1>
        {orgs.length === 0 ? (
          <p className="text-sm text-neutral-600">
            No organizations yet — create one below to start invoicing.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
            {orgs.map((org) => (
              <li key={org.id}>
                <Link
                  href={`/orgs/${org.id}`}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-neutral-50"
                >
                  <span className="font-medium text-neutral-900">
                    {org.name}
                  </span>
                  <span className="text-neutral-500">{org.role}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-base font-medium text-neutral-900">
          New organization
        </h2>
        <CreateOrgForm />
      </section>
    </div>
  );
}
