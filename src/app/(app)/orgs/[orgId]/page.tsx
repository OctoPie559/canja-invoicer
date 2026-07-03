import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { auditLog, invitation, member, user } from "@/lib/db/schema";
import { organization } from "@/lib/db/schema";
import { can, isRole } from "@/lib/authz/permissions";
import { requireSession } from "@/lib/transport/session";
import { InviteMemberForm } from "@/components/forms";
import { revokeInvitationAction } from "@/app/actions/organizations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
        <h1 className="font-heading text-xl font-semibold text-foreground">
          {org.name}
        </h1>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          your role <Badge variant="secondary">{role}</Badge>
        </span>
      </div>

      <nav className="flex gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/orgs/${orgId}/customers`}>Customers</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/orgs/${orgId}/products`}>Products & services</Link>
        </Button>
      </nav>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">Members</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.email}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary">{m.role}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {pendingInvitations.length > 0 && (
            <>
              <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">
                Pending invitations
              </h3>
              <ul className="divide-y text-sm">
                {pendingInvitations.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex items-center justify-between py-2"
                  >
                    <span className="flex items-center gap-2">
                      {inv.email}
                      <Badge variant="outline">{inv.role}</Badge>
                    </span>
                    {can(role, "member.invite") && (
                      <form
                        action={revokeInvitationAction.bind(null, orgId, inv.id)}
                      >
                        <Button variant="destructive" size="xs" type="submit">
                          Revoke
                        </Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {can(role, "member.invite") && (
            <div className="mt-6 border-t pt-4">
              <InviteMemberForm organizationId={orgId} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {timeline.map((entry) => (
                <li key={entry.id} className="flex justify-between py-2">
                  <span className="font-mono text-foreground">
                    {entry.action}
                  </span>
                  <span className="text-muted-foreground">
                    {entry.actorType} ·{" "}
                    {entry.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
