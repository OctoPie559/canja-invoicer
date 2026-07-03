import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { invitation, organization } from "@/lib/db/schema";
import { requireSession } from "@/lib/transport/session";
import { AcceptInvitationButton } from "@/components/forms";

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
    <div className="mx-auto max-w-md rounded-lg border border-neutral-200 bg-white p-6">
      <h1 className="mb-2 text-lg font-semibold text-neutral-900">
        Invitation to {org?.name ?? "an organization"}
      </h1>
      <p className="mb-4 text-sm text-neutral-600">
        {inv.email} · role: {inv.role}
      </p>
      {inv.status !== "pending" ? (
        <p className="text-sm text-neutral-600">
          This invitation is {inv.status}.
        </p>
      ) : emailMatches ? (
        <AcceptInvitationButton invitationId={inv.id} />
      ) : (
        <p className="text-sm text-red-600">
          This invitation was sent to {inv.email}. You are signed in as{" "}
          {session.user.email} — sign in with the invited address to accept.
        </p>
      )}
    </div>
  );
}
