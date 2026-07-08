import { ValidationError } from "./errors";

/**
 * Estimate status machine (brief §105). Issue moves draft → sent (the
 * quote is out); the customer's answer lands it on accepted or declined;
 * time can expire it; accepted quotes convert into a linked invoice draft.
 *
 *   draft ──issue──▶ sent ──▶ accepted ──convert──▶ converted
 *                     │  ╲──▶ declined
 *                     ╰────▶ expired ──▶ accepted (late yes is a yes)
 *
 * - drafts are edited or deleted, never anything else
 * - declined/expired can still be accepted (customers change their minds);
 *   declined→expired is meaningless and stays illegal
 * - converted is terminal — the invoice carries the relationship forward
 */

export type EstimateStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "declined"
  | "expired"
  | "converted";

const TRANSITIONS: Record<EstimateStatus, readonly EstimateStatus[]> = {
  draft: ["sent"],
  sent: ["accepted", "declined", "expired"],
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
