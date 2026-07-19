import { z } from "zod";

/** Shared client/server schemas; the server re-parses every input (§5.2). */

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Organization name must be at least 2 characters")
    .max(120),
  type: z.enum(["personal", "business"]).default("personal"),
});
export type CreateOrganizationInput = z.input<typeof createOrganizationSchema>;

export const inviteMemberSchema = z.object({
  email: z.email().toLowerCase(),
  // owner is not an invitable role; ownership transfers are a separate flow
  role: z.enum(["admin", "member", "viewer"]),
});
export type InviteMemberInput = z.input<typeof inviteMemberSchema>;

export const acceptInvitationSchema = z.object({
  invitationId: z.string().min(1),
});
export type AcceptInvitationInput = z.input<typeof acceptInvitationSchema>;
