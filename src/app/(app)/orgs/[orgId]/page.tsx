import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { auditLog, invitation, member, user } from "@/lib/db/schema";
import { organization } from "@/lib/db/schema";
import { can, isRole } from "@/lib/authz/permissions";
import { requireSession } from "@/lib/transport/session";
import { InviteMemberForm } from "@/components/forms";
import { revokeInvitationAction } from "@/app/actions/organizations";

/**
 * Reads may bypass services but never tenancy (ARCHITECTURE.md §1.1): the
 * membership check gates the page, and every query filters by org id.
 */
export default async function OrgPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const session = await requireSession();
  const db = getDb();

  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.userId, session.user.id)))
    .limit(1);
  if (!membership || !isRole(membership.role)) notFound();
  const role = membership.role;

  const [org] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);
  if (!org) notFound();

  const members = await db
    .select({ id: member.id, role: member.role, name: user.name, email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, orgId));

  const pendingInvitations = await db
    .select({ id: invitation.id, email: invitation.email, role: invitation.role })
    .from(invitation)
    .where(and(eq(invitation.organizationId, orgId), eq(invitation.status, "pending")));

  const timeline = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      actorType: auditLog.actorType,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(eq(auditLog.organizationId, orgId))
    .orderBy(desc(auditLog.createdAt))
    .limit(20);

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">{org.name}</h1>
        <span className="text-sm text-neutral-500">your role: {role}</span>
      </div>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-base font-medium text-neutral-900">Members</h2>
        <ul className="divide-y divide-neutral-100 text-sm">
          {members.map((m) => (
            <li key={m.id} className="flex justify-between py-2">
              <span>
                {m.name} <span className="text-neutral-500">({m.email})</span>
              </span>
              <span className="text-neutral-500">{m.role}</span>
            </li>
          ))}
        </ul>
        {pendingInvitations.length > 0 && (
          <>
            <h3 className="mt-4 mb-2 text-sm font-medium text-neutral-700">
              Pending invitations
            </h3>
            <ul className="divide-y divide-neutral-100 text-sm">
              {pendingInvitations.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between py-2">
                  <span>
                    {inv.email}{" "}
                    <span className="text-neutral-500">({inv.role})</span>
                  </span>
                  {can(role, "member.invite") && (
                    <form
                      action={revokeInvitationAction.bind(null, orgId, inv.id)}
                    >
                      <button className="text-xs text-red-600 underline">
                        Revoke
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        {can(role, "member.invite") && (
          <div className="mt-4 border-t border-neutral-100 pt-4">
            <InviteMemberForm organizationId={orgId} />
          </div>
        )}
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-base font-medium text-neutral-900">
          Activity
        </h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-neutral-600">No activity yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 text-sm">
            {timeline.map((entry) => (
              <li key={entry.id} className="flex justify-between py-2">
                <span className="font-mono text-neutral-800">
                  {entry.action}
                </span>
                <span className="text-neutral-500">
                  {entry.actorType} · {entry.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
