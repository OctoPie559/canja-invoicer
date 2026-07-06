import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import {
  invitation,
  member,
  organization,
  organizationSettings,
  subscriptions,
  user,
} from "@/lib/db/schema";
import { can } from "@/lib/authz/permissions";
import { requireMembership } from "@/lib/transport/org";
import { revokeInvitationAction } from "@/app/actions/organizations";
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

/**
 * Organization settings: profile, plan, members & invitations. Numbering,
 * tax rates, and branding join here in their slices (4, and settings work
 * in slice 2 for numbering prefixes).
 */
export default async function OrgSettingsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { role } = await requireMembership(orgId);
  const db = getDb();

  const [org] = await db
    .select({ name: organization.name, slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);
  if (!org) notFound();

  const [[settings], [subscription], members, pendingInvitations] =
    await Promise.all([
      db
        .select({ baseCurrency: organizationSettings.baseCurrency })
        .from(organizationSettings)
        .where(eq(organizationSettings.organizationId, orgId))
        .limit(1),
      db
        .select({ plan: subscriptions.plan })
        .from(subscriptions)
        .where(eq(subscriptions.organizationId, orgId))
        .limit(1),
      db
        .select({
          id: member.id,
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

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-xl font-semibold text-foreground">
        Settings
      </h1>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            Organization
          </CardTitle>
          <CardDescription>
            Profile and plan. Invoice numbering, tax rates, and branding are
            managed here as those features land.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{org.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Base currency</dt>
              <dd className="font-medium">
                {settings?.baseCurrency ?? "KES"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Plan</dt>
              <dd>
                <Badge variant="secondary" className="uppercase">
                  {subscription?.plan ?? "free"}
                </Badge>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">Members</CardTitle>
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
    </div>
  );
}
