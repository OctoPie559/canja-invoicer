import { and, eq, gt, inArray, sql } from "drizzle-orm";
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
import { getEmailSender, type EmailSender } from "@/lib/email/port";
import { appBaseUrl } from "@/lib/config";

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

/** Renders the invitation email body; the transport injects the HTML one. */
export type InvitationRenderer = (params: {
  inviterName: string;
  organizationName: string;
  role: string;
  url: string;
}) => Promise<{ subject: string; html?: string; text: string }>;

/** Framework-free default so the pure service never imports a JSX template. */
const plainInvitation: InvitationRenderer = async ({
  inviterName,
  organizationName,
  role,
  url,
}) => ({
  subject: `You've been invited to ${organizationName} on Canja`,
  text: `${inviterName} has invited you to join ${organizationName} as ${role}.\n\nAccept: ${url}`,
});

/** Side-effect ports, injectable for tests; defaults resolve the real ones. */
export interface InviteDeps {
  emailSender?: EmailSender;
  baseUrl?: string;
  renderInvitation?: InvitationRenderer;
}

export async function inviteMember(
  db: Database,
  ctx: ActorContext,
  input: InviteMemberInput,
  deps: InviteDeps = {},
): Promise<{ invitationId: string }> {
  const data = inviteMemberSchema.parse(input);
  if (!ctx.actorId) throw new PermissionError("member.invite");

  const emailSender = deps.emailSender ?? getEmailSender();
  const baseUrl = deps.baseUrl ?? appBaseUrl();
  // Default is a framework-free plain-text renderer so the service layer
  // never imports JSX. The transport layer injects the rich HTML template
  // (see app/actions/organizations.ts).
  const renderInvitation = deps.renderInvitation ?? plainInvitation;
  const invitationId = newId();
  const invitedEmail = data.email;

  const invite = await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "member.invite");

    // seat cap counts active members plus seats already promised to live
    // (unexpired) pending invitations, so Free cannot over-invite
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
          gt(invitation.expiresAt, new Date()),
        ),
      );
    requireWithinCap(plan, "seatCap", members.length + pending.length);

    // inviting someone who already holds a seat is always a mistake
    // (invitedEmail is lowercased by Zod; stored emails may not be)
    const [existingUser] = await tx
      .select({ id: user.id })
      .from(user)
      .where(sql`lower(${user.email}) = ${invitedEmail}`)
      .limit(1);
    if (existingUser) {
      const [existingMember] = await tx
        .select({ id: member.id })
        .from(member)
        .where(
          and(
            eq(member.organizationId, ctx.organizationId),
            eq(member.userId, existingUser.id),
          ),
        )
        .limit(1);
      if (existingMember) {
        throw new ValidationError(
          "This person is already a member of the organization",
        );
      }
    }

    // only a LIVE pending invitation blocks a re-invite; time-expired ones
    // (even if never flipped to 'expired') do not
    const [duplicate] = await tx
      .select({ id: invitation.id })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, ctx.organizationId),
          eq(invitation.email, invitedEmail),
          eq(invitation.status, "pending"),
          gt(invitation.expiresAt, new Date()),
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
    const [inviter] = await tx
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, ctx.actorId!))
      .limit(1);
    return {
      orgName: org?.name ?? "an organization",
      inviterName: inviter?.name ?? "A teammate",
    };
  });

  // side effect after commit — an email must never fire for a rolled-back invite
  const message = await renderInvitation({
    inviterName: invite.inviterName,
    organizationName: invite.orgName,
    role: data.role,
    url: `${baseUrl}/invitations/${invitationId}`,
  });
  const result = await emailSender
    .send({ to: invitedEmail, ...message })
    .catch(() => ({ providerMessageId: null }));
  await db
    .update(emailMessages)
    .set({
      status: result.providerMessageId ? "sent" : "send_failed",
      providerMessageId: result.providerMessageId,
    })
    .where(
      and(
        eq(emailMessages.organizationId, ctx.organizationId),
        eq(emailMessages.entityId, invitationId),
      ),
    );

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

/** Internal marker: invitation found expired inside the accept transaction. */
class InvitationExpired extends Error {}

/**
 * Accept runs as the invited user, who is not yet a member — so the caller
 * is identified by their verified account email, not by role. The invitation
 * is re-read FOR UPDATE inside the transaction: concurrent accepts serialize
 * on the row lock, and the member table's (org, user) unique index is the
 * final guarantee against duplicate memberships.
 */
export async function acceptInvitation(
  db: Database,
  actor: { userId: string; meta?: RequestMeta },
  input: AcceptInvitationInput,
): Promise<{ organizationId: string }> {
  const data = acceptInvitationSchema.parse(input);

  // resolve the invitation's org first (owner-level read; single row by id)
  const [invRef] = await db
    .select({ organizationId: invitation.organizationId })
    .from(invitation)
    .where(eq(invitation.id, data.invitationId))
    .limit(1);
  if (!invRef) throw new NotFoundError("invitation");
  const organizationId = invRef.organizationId;

  const ctx: ActorContext = {
    actorType: "user",
    actorId: actor.userId,
    organizationId,
    ...actor.meta,
  };

  try {
    await withOrgTransaction(db, organizationId, async (tx) => {
      // fresh, locked read — never trust the pre-transaction snapshot
      const [inv] = await tx
        .select()
        .from(invitation)
        .where(eq(invitation.id, data.invitationId))
        .for("update");
      if (!inv) throw new NotFoundError("invitation");

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
        throw new InvitationExpired();
      }

      const [existing] = await tx
        .select({ id: member.id })
        .from(member)
        .where(
          and(
            eq(member.organizationId, organizationId),
            eq(member.userId, actor.userId),
          ),
        )
        .limit(1);
      if (existing) {
        throw new ValidationError(
          "You are already a member of this organization",
        );
      }

      const role = inv.role && isRole(inv.role) ? inv.role : "member";
      await tx.insert(member).values({
        id: newId(),
        organizationId,
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
  } catch (error) {
    if (error instanceof InvitationExpired) {
      // persist the expiry in its own committed transaction — the failed
      // accept must not roll this back
      await withOrgTransaction(db, organizationId, async (tx) => {
        await tx
          .update(invitation)
          .set({ status: "expired" })
          .where(
            and(
              eq(invitation.id, data.invitationId),
              eq(invitation.status, "pending"),
            ),
          );
        await writeAudit(tx, ctx, {
          action: "invitation.expired",
          entityType: "invitation",
          entityId: data.invitationId,
          changes: {
            before: { status: "pending" },
            after: { status: "expired" },
          },
        });
      });
      throw new ValidationError("Invitation has expired");
    }
    throw error;
  }

  return { organizationId };
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

/** Rename the organization — audited like every mutation (settings scope). */
export async function updateOrganizationName(
  db: Database,
  ctx: ActorContext,
  input: { name: string },
): Promise<void> {
  const name = String(input.name ?? "").trim();
  if (name.length < 2 || name.length > 120) {
    throw new ValidationError("Organization name must be 2-120 characters");
  }
  if (!ctx.actorId) throw new PermissionError("settings.update");

  await withOrgTransaction(db, ctx.organizationId, async (tx) => {
    const caller = await getMembership(tx, ctx.organizationId, ctx.actorId!);
    authorize(caller.role, "settings.update");

    const [before] = await tx
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, ctx.organizationId))
      .for("update");
    if (!before) throw new NotFoundError("Organization");
    if (before.name === name) return;

    // slug is deliberately untouched: it may live in bookmarks/URLs
    await tx
      .update(organization)
      .set({ name })
      .where(eq(organization.id, ctx.organizationId));
    await writeAudit(tx, ctx, {
      action: "organization.updated",
      entityType: "organization",
      entityId: ctx.organizationId,
      changes: { before: { name: before.name }, after: { name } },
    });
  });
}
