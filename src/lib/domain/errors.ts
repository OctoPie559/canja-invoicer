/**
 * Typed domain errors. Services throw these; transport wrappers map them to
 * HTTP/UI responses. Never put unmasked PII (e.g. phone numbers) in messages.
 */

export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

/** Input failed validation (Zod or domain rules). */
export class ValidationError extends DomainError {
  constructor(message: string) {
    super("validation_failed", message);
  }
}

/** Actor lacks the role permission for this action in this organization. */
export class PermissionError extends DomainError {
  constructor(action: string) {
    super("permission_denied", `Not permitted to perform ${action}`);
  }
}

/** Organization's plan does not include this capability. */
export class EntitlementError extends DomainError {
  constructor(capability: string) {
    super("entitlement_required", `Plan does not include ${capability}`);
  }
}

/** Entity not found within the actor's organization (or soft-deleted). */
export class NotFoundError extends DomainError {
  constructor(entityType: string) {
    super("not_found", `${entityType} not found`);
  }
}

/** Optimistic-lock version mismatch: someone else changed the record. */
export class ConflictError extends DomainError {
  constructor(entityType: string) {
    super(
      "conflict",
      `${entityType} was modified by someone else; reload and retry`,
    );
  }
}

/** Attempted write to an issued (immutable) document. */
export class ImmutableDocumentError extends DomainError {
  constructor(entityType: string) {
    super(
      "immutable_document",
      `${entityType} is issued and cannot be modified; use a credit note or a new document`,
    );
  }
}

/** Too many requests in the window (brief §6 rate limiting). */
export class RateLimitError extends DomainError {
  constructor(message: string) {
    super("rate_limited", message);
  }
}

/** Money invariant violated (currency mismatch, bad amount, ...). */
export class MoneyError extends DomainError {
  constructor(message: string) {
    super("money_invariant", message);
  }
}
