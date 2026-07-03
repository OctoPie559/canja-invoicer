import { and, eq, inArray } from "drizzle-orm";
import type { Database, Transaction } from "@/lib/db/client";
import { withOrgTransaction } from "@/lib/db/tx";
import {
  emailMessages,
  invitation,
  member,
  organization,
  organizationBranding,
  organizationSettings,
  subscriptions,
  user,
} from "@/lib/db/schema";
import { newId } from "@/lib/domain/ids";
import {
  NotFoundError,
  PermissionError,
  ValidationError,
} from "@/lib/domain/errors";
import { writeAudit } from "@/lib/audit/write";
import type { ActorContext } from "@/lib/audit/context";
import { authorize, isRole, type Role } from "@/lib/authz/permissions";
import { requireWithinCap, type Plan } from "@/lib/authz/entitlements";
import {
  acceptInvitationSchema,
  createOrganizationSchema,
  inviteMemberSchema,
  type AcceptInvitationInput,
  type CreateOrganizationInput,
  type InviteMemberInput,
} from "@/lib/validation/organizations";
import { getEmailSender } from "@/lib/email/port";

/**
 * Organization lifecycle lives HERE, not in Better Auth (ARCHITECTURE.md
 * §10): every mutation follows the pipeline — validate, authorize, entitle,
 * transact, audit in the same transaction — under the RLS backstop.
 */

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "org"}-${newId().slice(-6)}`;
}

/** Membership lookup used by services to resolve the caller's role. */
export async function getMembership(
  tx: Transaction,
  organizationId: string,
  userId: string,
): Promise<{ id: string; role: Role }> {
  const [row] = await tx
    .select({ id: member.id, role: member.role })
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
    )
    .limit(1);
  if (!row || !isRole(row.role)) {
    throw new PermissionError("organization.access");
  }
  return { id: row.id, role: row.role };
}

async function getPlan(tx: Transaction, organizationId: string): Promise<Plan> {
  const [row] = await tx
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);
  return row?.plan ?? "free";
}

export async function createOrganization(
  db: Database,
  input: CreateOrganizationInput,
  actor: { userId: string; meta?: RequestMeta },
): Promise<{ organizationId: string }> {
  const data = createOrganizationSchema.parse(input);
  const organizationId = newId();
  const ctx: ActorContext = {
    actorType: "user",
    actorId: actor.userId,
    organizationId,
    ...actor.meta,
  };

  await withOrgTransaction(db, organizationId, async (tx) => {
    await tx.insert(organization).values({
      id: organizationId,
      name: data.name,
      slug: slugify(data.name),
      metadata: JSON.stringify({ type: data.type }),
    });
    await tx.insert(member).values({
      id: newId(),
      organizationId,
      userId: actor.userId,
      role: "owner",
    });
    await tx.insert(organizationSettings).values({
      id: newId(),
      organizationId,
    });
    await tx.insert(organizationBranding).values({
      id: newId(),
      organizationId,
    });
    await tx.insert(subscriptions).values({
      id: newId(),
      organizationId,
      plan: "free",
    });
    await writeAudit(tx, ctx, {
      action: "organization.created",
      entityType: "organization",
      entityId: organizationId,
      changes: { after: { name: data.name, type: data.type } },
    });
    await writeAudit(tx, ctx, {
      action: "member.added",
      entityType: "member",
      entityId: actor.userId,
      changes: { after: { role: "owner" } },
    });
  });

  return { organizationId };
}

export async function inviteMember(
  db: Database,
  ctx: ActorContext,
  input: InviteMemberInput,
): Promise<{ invitationId: string }> {
  const data = inviteMemberSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("member.invite");

  const invitationId = newId();
  const invitedEmail = data.email;

  const orgName = await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "member.invite");

    // seat cap counts active members plus seats already promised to
    // pending invitations, so Free cannot over-invite
    const plan = await getPlan(tx, ctx.organizationId);
    const members = await tx
      .select({ id: member.id })
      .from(member)
      .where(eq(member.organizationId, ctx.organizationId));
    const pending = await tx
      .select({ id: invitation.id })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, ctx.organizationId),
          eq(invitation.status, "pending"),
        ),
      );
    requireWithinCap(plan, "seatCap", members.length + pending.length);

    const [duplicate] = await tx
      .select({ id: invitation.id })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, ctx.organizationId),
          eq(invitation.email, invitedEmail),
          eq(invitation.status, "pending"),
        ),
      )
      .limit(1);
    if (duplicate) {
      throw new ValidationError("An invitation for this email is already pending");
    }

    await tx.insert(invitation).values({
      id: invitationId,
      organizationId: ctx.organizationId,
      email: invitedEmail,
      role: data.role,
      status: "pending",
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      inviterId: ctx.actorId!,
    });
    await tx.insert(emailMessages).values({
      id: newId(),
      organizationId: ctx.organizationId,
      type: "invitation",
      recipient: invitedEmail,
      subject: "You have been invited",
      entityType: "invitation",
      entityId: invitationId,
      status: "queued",
    });
    await writeAudit(tx, ctx, {
      action: "member.invited",
      entityType: "invitation",
      entityId: invitationId,
      changes: { after: { email: invitedEmail, role: data.role } },
    });

    const [org] = await tx
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, ctx.organizationId))
      .limit(1);
    return org?.name ?? "an organization";
  });

  // side effect after commit — an email must never fire for a rolled-back invite
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const result = await getEmailSender()
    .send({
      to: invitedEmail,
      subject: `You've been invited to ${orgName} on invoicer`,
      text: `You have been invited to join ${orgName} as ${data.role}.\n\nAccept: ${baseUrl}/invitations/${invitationId}`,
    })
    .catch(() => ({ providerMessageId: null }));
  await db
    .update(emailMessages)
    .set({
      status: result.providerMessageId ? "sent" : "send_failed",
      providerMessageId: result.providerMessageId,
    })
    .where(eq(emailMessages.entityId, invitationId));

  return { invitationId };
}

export async function revokeInvitation(
  db: Database,
  ctx: ActorContext,
  invitationId: string,
): Promise<void> {
  if (!ctx.actorId) throw new PermissionError("member.invite");
  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "member.invite");

    const [inv] = await tx
      .select({ id: invitation.id, status: invitation.status })
      .from(invitation)
      .where(
        and(
          eq(invitation.id, invitationId),
          eq(invitation.organizationId, ctx.organizationId),
        ),
      )
      .limit(1);
    if (!inv) throw new NotFoundError("invitation");
    if (inv.status !== "pending") {
      throw new ValidationError("Only pending invitations can be revoked");
    }

    await tx
      .update(invitation)
      .set({ status: "revoked" })
      .where(eq(invitation.id, invitationId));
    await writeAudit(tx, ctx, {
      action: "invitation.revoked",
      entityType: "invitation",
      entityId: invitationId,
      changes: { before: { status: "pending" }, after: { status: "revoked" } },
    });
  });
}

/**
 * Accept runs as the invited user, who is not yet a member — so the caller
 * is identified by their verified account email, not by role.
 */
export async function acceptInvitation(
  db: Database,
  actor: { userId: string; meta?: RequestMeta },
  input: AcceptInvitationInput,
): Promise<{ organizationId: string }> {
  const data = acceptInvitationSchema.parse(input);

  // resolve the invitation's org first (owner-level read; single row by id)
  const [inv] = await db
    .select({
      id: invitation.id,
      organizationId: invitation.organizationId,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
    })
    .from(invitation)
    .where(eq(invitation.id, data.invitationId))
    .limit(1);
  if (!inv) throw new NotFoundError("invitation");

  const ctx: ActorContext = {
    actorType: "user",
    actorId: actor.userId,
    organizationId: inv.organizationId,
    ...actor.meta,
  };

  await withOrgTransaction(db, inv.organizationId, async (tx) => {
    const [u] = await tx
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, actor.userId))
      .limit(1);
    if (!u || u.email.toLowerCase() !== inv.email.toLowerCase()) {
      throw new PermissionError("invitation.accept");
    }
    if (inv.status !== "pending") {
      throw new ValidationError("Invitation is no longer pending");
    }
    if (inv.expiresAt.getTime() < Date.now()) {
      await tx
        .update(invitation)
        .set({ status: "expired" })
        .where(eq(invitation.id, inv.id));
      throw new ValidationError("Invitation has expired");
    }

    const role = inv.role && isRole(inv.role) ? inv.role : "member";
    await tx.insert(member).values({
      id: newId(),
      organizationId: inv.organizationId,
      userId: actor.userId,
      role,
    });
    await tx
      .update(invitation)
      .set({ status: "accepted" })
      .where(eq(invitation.id, inv.id));
    await writeAudit(tx, ctx, {
      action: "member.joined",
      entityType: "member",
      entityId: actor.userId,
      changes: { after: { role, via: "invitation" } },
    });
  });

  return { organizationId: inv.organizationId };
}

/** Orgs the user belongs to (cross-org read for the dashboard shell). */
export async function listUserOrganizations(
  db: Database,
  userId: string,
): Promise<Array<{ id: string; name: string; role: string }>> {
  const memberships = await db
    .select({ organizationId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, userId));
  if (memberships.length === 0) return [];
  const orgs = await db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .where(
      inArray(
        organization.id,
        memberships.map((m) => m.organizationId),
      ),
    );
  const roleByOrg = new Map(memberships.map((m) => [m.organizationId, m.role]));
  return orgs.map((o) => ({ ...o, role: roleByOrg.get(o.id) ?? "member" }));
}
