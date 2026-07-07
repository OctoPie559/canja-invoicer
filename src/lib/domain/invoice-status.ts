import { ValidationError } from "./errors";

/**
 * Invoice status machine (brief §104). One place defines every legal
 * transition; the service layer calls assertTransition before any status
 * write, so an illegal move can never reach the database.
 *
 *   draft ──issue──▶ sent ──▶ partial ──▶ paid
 *                     │  ╲       │  ╲
 *                     │   ▶ overdue ─▶ paid
 *                     ▼        ▼
 *                    void     void
 *
 * - "sent" is the issued/receivable state (issue locks the document; the
 *   slice-3 email send does not change status).
 * - draft never becomes void — drafts are deleted instead; void exists to
 *   annul a document that was already issued.
 * - paid is terminal: corrections to a paid invoice go through credit notes.
 * - overdue can return to partial/paid as payments land (slice 4) but never
 *   back to sent.
 */

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "partial"
  | "paid"
  | "overdue"
  | "void";

const TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  draft: ["sent"],
  sent: ["partial", "paid", "overdue", "void"],
  partial: ["paid", "overdue", "void"],
  overdue: ["partial", "paid", "void"],
  paid: [],
  void: [],
};

export function canTransition(
  from: InvoiceStatus,
  to: InvoiceStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(
  from: InvoiceStatus,
  to: InvoiceStatus,
): void {
  if (!canTransition(from, to)) {
    throw new ValidationError(
      `An invoice cannot go from ${from} to ${to}`,
    );
  }
}

/** Only drafts are editable — issue freezes the document (brief §5.3). */
export function isEditable(status: InvoiceStatus): boolean {
  return status === "draft";
}

/** Only drafts may be deleted; issued documents are annulled via void. */
export function isDeletable(status: InvoiceStatus): boolean {
  return status === "draft";
}

export function isVoidable(status: InvoiceStatus): boolean {
  return canTransition(status, "void");
}

/** Statuses that still carry a collectible balance. */
export function isOutstanding(status: InvoiceStatus): boolean {
  return status === "sent" || status === "partial" || status === "overdue";
}
