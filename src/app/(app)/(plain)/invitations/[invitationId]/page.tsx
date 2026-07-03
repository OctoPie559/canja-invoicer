import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { invitation, organization } from "@/lib/db/schema";
import { requireSession } from "@/lib/transport/session";
import { AcceptInvitationButton } from "@/components/forms";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const { invitationId } = await params;
  const session = await requireSession();
  const db = getDb();

  const [inv] = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      organizationId: invitation.organizationId,
    })
    .from(invitation)
    .where(eq(invitation.id, invitationId))
    .limit(1);
  if (!inv) notFound();

  const [org] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, inv.organizationId))
    .limit(1);

  const emailMatches =
    inv.email.toLowerCase() === session.user.email.toLowerCase();

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle className="font-heading text-lg">
          Invitation to {org?.name ?? "an organization"}
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          {inv.email} <Badge variant="outline">{inv.role}</Badge>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {inv.status !== "pending" ? (
          <p className="text-sm text-muted-foreground">
            This invitation is {inv.status}.
          </p>
        ) : emailMatches ? (
          <AcceptInvitationButton invitationId={inv.id} />
        ) : (
          <Alert variant="destructive">
            <AlertDescription>
              This invitation was sent to {inv.email}. You are signed in as{" "}
              {session.user.email} — sign in with the invited address to
              accept.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
