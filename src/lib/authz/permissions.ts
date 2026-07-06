import { PermissionError } from "@/lib/domain/errors";

/**
 * Role permission matrix (PROJECT_BRIEF.md §6). Checked server-side on every
 * mutation, scoped by organization. Client-side role checks are UX only and
 * are never trusted.
 */

export const ROLES = ["owner", "admin", "member", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export type Action =
  | "customer.create"
  | "customer.update"
  | "customer.delete"
  | "product.create"
  | "product.update"
  | "product.delete"
  | "invoice.create"
  | "invoice.update"
  | "invoice.issue"
  | "invoice.send"
  | "invoice.void"
  | "estimate.create"
  | "estimate.update"
  | "estimate.send"
  | "estimate.convert"
  | "credit_note.create"
  | "credit_note.issue"
  | "recurring.manage"
  | "payment.record"
  | "comment.create"
  | "comment.delete" // any comment; authors may always delete their own
  | "member.invite"
  | "member.remove"
  | "member.role_change"
  | "settings.update"
  | "branding.update"
  | "tax_rate.manage"
  | "fx_rate.manage"
  | "billing.manage";

/** Actions each role may perform, from least to most privileged. */
const VIEWER: Action[] = [];

const MEMBER: Action[] = [
  ...VIEWER,
  "customer.create",
  "customer.update",
  "product.create",
  "product.update",
  "invoice.create",
  "invoice.update",
  "invoice.issue",
  "invoice.send",
  "estimate.create",
  "estimate.update",
  "estimate.send",
  "estimate.convert",
  "credit_note.create",
  "payment.record",
  "comment.create",
];

const ADMIN: Action[] = [
  ...MEMBER,
  "comment.delete",
  "customer.delete",
  "product.delete",
  "invoice.void",
  "credit_note.issue",
  "recurring.manage",
  "member.invite",
  "member.remove",
  "member.role_change",
  "settings.update",
  "branding.update",
  "tax_rate.manage",
  "fx_rate.manage",
];

const OWNER: Action[] = [...ADMIN, "billing.manage"];

const MATRIX: Record<Role, ReadonlySet<Action>> = {
  viewer: new Set(VIEWER),
  member: new Set(MEMBER),
  admin: new Set(ADMIN),
  owner: new Set(OWNER),
};

export function can(role: Role, action: Action): boolean {
  return MATRIX[role].has(action);
}

/** Throw unless `role` may perform `action`. Call in every mutation. */
export function authorize(role: Role, action: Action): void {
  if (!can(role, action)) {
    throw new PermissionError(action);
  }
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
