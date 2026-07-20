"use server";

import { redirect } from "next/navigation";
import { runWithActor } from "@/lib/audit/context";
import { getDb } from "@/lib/db/client";
import { DomainError } from "@/lib/domain/errors";
import { ZodError } from "zod";
import {
  acceptInvitation,
  createOrganization,
  inviteMember,
  leaveOrganization,
  recordReferralSource,
  removeMember,
  revokeInvitation,
} from "@/lib/services/organizations";
import { uploadBrandingLogo } from "@/lib/services/branding";
import {
  requestMeta,
  requireSession,
  userActor,
} from "@/lib/transport/session";
import { invitationEmail } from "@/lib/email/templates";

/**
 * Server Actions are thin wrappers (ARCHITECTURE.md §1.2): authenticate,
 * build the actor context, call one service, map errors. Nothing else.
 */

export interface ActionState {
  error: string | null;
}

function mapError(error: unknown): ActionState {
  if (error instanceof ZodError) {
    return { error: error.issues[0]?.message ?? "Invalid input" };
  }
  if (error instanceof DomainError) {
    return { error: error.message };
  }
  throw error; // unexpected — let Sentry/error boundary handle it
}

export async function createOrganizationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  let organizationId: string;
  try {
    const result = await createOrganization(
      getDb(),
      {
        name: String(formData.get("name") ?? ""),
        type: formData.get("type") === "business" ? "business" : "personal",
      },
      { userId: session.user.id, meta: await requestMeta() },
    );
    organizationId = result.organizationId;
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}`);
}

/**
 * Onboarding step 1 (issue 1): create the org and, if provided, attach a logo
 * in one go, then move the new owner into the guided flow. The logo is
 * best-effort — a storage hiccup must not strand a just-created org; the user
 * can add it later in branding settings.
 */
export async function createOrgOnboardingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  let organizationId: string;
  try {
    const result = await createOrganization(
      getDb(),
      {
        name: String(formData.get("name") ?? ""),
        type: formData.get("type") === "business" ? "business" : "personal",
      },
      { userId: session.user.id, meta: await requestMeta() },
    );
    organizationId = result.organizationId;
  } catch (error) {
    return mapError(error);
  }

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    try {
      const ctx = await userActor(session.user.id, organizationId);
      const bytes = new Uint8Array(await logo.arrayBuffer());
      await runWithActor(ctx, () =>
        uploadBrandingLogo(getDb(), ctx, {
          bytes,
          contentType: logo.type,
        }),
      );
    } catch (err) {
      // best-effort — the org exists; a missing logo is fixable in settings.
      // Breadcrumb so a systemic storage outage during onboarding is visible.
      console.warn("onboarding logo upload failed", err);
    }
  }

  redirect(`/onboarding/${organizationId}/survey`);
}

/** Onboarding step "how did you hear about us" (issue 1) — data collection. */
export async function recordReferralAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      recordReferralSource(
        getDb(),
        ctx,
        String(formData.get("referralSource") ?? ""),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
  redirect(`/onboarding/${organizationId}/verify`);
}

export async function inviteMemberAction(
  organizationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  try {
    await runWithActor(ctx, () =>
      inviteMember(
        getDb(),
        ctx,
        {
          email: String(formData.get("email") ?? ""),
          role: String(formData.get("role") ?? "member") as
            | "admin"
            | "member"
            | "viewer",
        },
        // transport injects the rich HTML template; the service default is
        // plain text so it stays framework-free
        { renderInvitation: invitationEmail },
      ),
    );
  } catch (error) {
    return mapError(error);
  }
  // stay on the members page so the inviter sees the pending list update
  redirect(`/orgs/${organizationId}/settings/members`);
}

export async function removeMemberAction(
  organizationId: string,
  targetUserId: string,
): Promise<void> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  await runWithActor(ctx, () => removeMember(getDb(), ctx, targetUserId));
  redirect(`/orgs/${organizationId}/settings/members`);
}

export async function leaveOrganizationAction(
  organizationId: string,
): Promise<void> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  await runWithActor(ctx, () => leaveOrganization(getDb(), ctx));
  // no longer a member — leave the org's routes entirely
  redirect("/dashboard");
}

export async function revokeInvitationAction(
  organizationId: string,
  invitationId: string,
): Promise<void> {
  const session = await requireSession();
  const ctx = await userActor(session.user.id, organizationId);
  await runWithActor(ctx, () => revokeInvitation(getDb(), ctx, invitationId));
  redirect(`/orgs/${organizationId}`);
}

export async function acceptInvitationAction(
  invitationId: string,
): Promise<ActionState> {
  const session = await requireSession();
  let organizationId: string;
  try {
    const result = await acceptInvitation(
      getDb(),
      { userId: session.user.id, meta: await requestMeta() },
      { invitationId },
    );
    organizationId = result.organizationId;
  } catch (error) {
    return mapError(error);
  }
  redirect(`/orgs/${organizationId}`);
}
