import { ValidationError } from "./errors";

/**
 * Estimate status machine (brief §105). Issue moves draft → sent (the
 * quote is out); the customer opening the public link marks it viewed; the
 * customer's answer lands it on accepted or declined; time can expire it;
 * accepted quotes convert into a linked invoice draft.
 *
 *   draft ─issue─▶ sent ─view─▶ viewed ─▶ accepted ─convert─▶ converted
 *                   │  ╲          │  ╲──▶ declined
 *                   │   ╲─────────┴────▶ expired ─▶ accepted (late yes)
 *
 * - drafts are edited or deleted, never anything else
 * - "viewed" is the customer having opened the public quote; it advances
 *   only from "sent" (a decided quote is not un-decided by another view)
 * - declined/expired can still be accepted (customers change their minds);
 *   declined→expired is meaningless and stays illegal
 * - converted is terminal — the invoice carries the relationship forward
 */

export type EstimateStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "accepted"
  | "declined"
  | "expired"
  | "converted";

const TRANSITIONS: Record<EstimateStatus, readonly EstimateStatus[]> = {
  draft: ["sent"],
  sent: ["viewed", "accepted", "declined", "expired"],
  viewed: ["accepted", "declined", "expired"],
  accepted: ["converted", "declined"],
  declined: ["accepted"],
  expired: ["accepted"],
  converted: [],
};

export function canEstimateTransition(
  from: EstimateStatus,
  to: EstimateStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertEstimateTransition(
  from: EstimateStatus,
  to: EstimateStatus,
): void {
  if (!canEstimateTransition(from, to)) {
    throw new ValidationError(`An estimate cannot go from ${from} to ${to}`);
  }
}

export function isEstimateEditable(status: EstimateStatus): boolean {
  return status === "draft";
}

export function isEstimateDeletable(status: EstimateStatus): boolean {
  return status === "draft";
}

export function isEstimateConvertible(status: EstimateStatus): boolean {
  return canEstimateTransition(status, "converted");
}

/** A view only advances a freshly-sent quote; anything else is a no-op. */
export function marksAsViewed(status: EstimateStatus): boolean {
  return status === "sent";
}

/** Statuses from which the customer may still accept/decline the quote. */
export function isAwaitingDecision(status: EstimateStatus): boolean {
  return status === "sent" || status === "viewed";
}
