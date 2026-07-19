import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { invitation, organization } from "@/lib/db/schema";
import { getOptionalSession } from "@/lib/transport/session";
import { AcceptInvitationButton } from "@/components/forms";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Invitation acceptance (issue 6). Works logged out: a person without an
 * account signs up with the invited address, returns here, and accepts — they
 * join the inviting org and are NEVER routed through "create your workspace".
 */
export default async function InvitationPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const { invitationId } = await params;
  const session = await getOptionalSession();
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

  // carry the invite through auth so they come back here to accept
  const returnTo = `/invitations/${inv.id}`;
  const signupHref = `/signup?redirect=${encodeURIComponent(returnTo)}&email=${encodeURIComponent(inv.email)}`;
  const loginHref = `/login?redirect=${encodeURIComponent(returnTo)}`;

  const emailMatches =
    session?.user.email.toLowerCase() === inv.email.toLowerCase();

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
      <CardContent className="space-y-4">
        {inv.status !== "pending" ? (
          <p className="text-sm text-muted-foreground">
            This invitation is {inv.status}.
          </p>
        ) : !session ? (
          <>
            <p className="text-sm text-muted-foreground">
              Create an account or sign in with{" "}
              <span className="font-medium text-foreground">{inv.email}</span>{" "}
              to join {org?.name ?? "the organization"}.
            </p>
            <div className="flex gap-2">
              <Button asChild className="flex-1">
                <Link href={signupHref}>Create account</Link>
              </Button>
              <Button asChild variant="outline" className="flex-1">
                <Link href={loginHref}>Sign in</Link>
              </Button>
            </div>
          </>
        ) : emailMatches ? (
          <AcceptInvitationButton invitationId={inv.id} />
        ) : (
          <Alert variant="destructive">
            <AlertDescription>
              This invitation was sent to {inv.email}, but you are signed in as{" "}
              {session.user.email}. Sign in with the invited address to accept.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
