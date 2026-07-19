import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { invitation, member, user } from "@/lib/db/schema";
import { can } from "@/lib/authz/permissions";
import { requireMembership } from "@/lib/transport/org";
import {
  leaveOrganizationAction,
  removeMemberAction,
  revokeInvitationAction,
} from "@/app/actions/organizations";
import { InviteMemberForm } from "@/components/forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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

export default async function MembersSettingsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { session, role } = await requireMembership(orgId);
  const currentUserId = session.user.id;
  const db = getDb();

  const [members, pendingInvitations] = await Promise.all([
    db
      .select({
        id: member.id,
        userId: member.userId,
        role: member.role,
        name: user.name,
        email: user.email,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, orgId)),
    db
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
      })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, orgId),
          eq(invitation.status, "pending"),
        ),
      ),
  ]);

  const canRemove = can(role, "member.remove");
  const ownerCount = members.filter((m) => m.role === "owner").length;
  const soleOwner =
    ownerCount <= 1 &&
    members.some((m) => m.userId === currentUserId && m.role === "owner");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-base">
          Members & roles
        </CardTitle>
        <CardDescription>
          Who can access this organization, and their roles.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              {canRemove && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">
                  {m.name}
                  {m.userId === currentUserId && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      (you)
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {m.email}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{m.role}</Badge>
                </TableCell>
                {canRemove && (
                  <TableCell className="text-right">
                    {/* owners are protected; remove yourself via Leave below */}
                    {m.userId !== currentUserId && m.role !== "owner" && (
                      <form
                        action={removeMemberAction.bind(null, orgId, m.userId)}
                      >
                        <Button variant="ghost" size="xs" type="submit">
                          Remove
                        </Button>
                      </form>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Leave organization (issue 7) — the last owner must transfer or
            delete the org first, so it's disabled for a sole owner. */}
        <div className="mt-6 flex items-center justify-between border-t pt-4">
          <div className="text-sm">
            <p className="font-medium text-foreground">Leave this organization</p>
            <p className="text-muted-foreground">
              {soleOwner
                ? "You are the only owner — transfer ownership or delete the organization first."
                : "You will lose access to its customers, invoices, and payments."}
            </p>
          </div>
          <form action={leaveOrganizationAction.bind(null, orgId)}>
            <Button
              variant="destructive"
              size="sm"
              type="submit"
              disabled={soleOwner}
            >
              Leave
            </Button>
          </form>
        </div>
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
  );
}
