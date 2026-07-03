import { EntitlementError } from "@/lib/domain/errors";

/**
 * Plan entitlements (PROJECT_BRIEF.md §4.4), checked server-side exactly like
 * permissions. A gated feature is never merely hidden in the UI.
 *
 * Never gated, by design: the audit trail, data export (PDF/CSV), and the
 * ability to get paid. Withholding these damages trust in a financial tool.
 *
 * Free-tier caps are placeholders pending pricing validation (brief §10);
 * changing them is a config edit here, not a schema change.
 */

export type Plan = "free" | "pro";

export interface Entitlements {
  /** Max invoices issued per calendar month; null = unlimited. */
  monthlyInvoiceCap: number | null;
  /** Max team seats (members) including the owner. */
  seatCap: number;
  recurringInvoices: boolean;
  multiCurrency: boolean;
  customTemplates: boolean;
  advancedReports: boolean;
  removeWatermark: boolean;
  clientPortal: boolean;
}

export const PLAN_ENTITLEMENTS: Record<Plan, Entitlements> = {
  free: {
    monthlyInvoiceCap: 20,
    seatCap: 1,
    recurringInvoices: false,
    multiCurrency: false,
    customTemplates: false,
    advancedReports: false,
    removeWatermark: false,
    clientPortal: false,
  },
  pro: {
    monthlyInvoiceCap: null,
    seatCap: 10,
    recurringInvoices: true,
    multiCurrency: true,
    customTemplates: true,
    advancedReports: true,
    removeWatermark: true,
    clientPortal: true,
  },
};

export type BooleanEntitlement = {
  [K in keyof Entitlements]: Entitlements[K] extends boolean ? K : never;
}[keyof Entitlements];

/** Throw unless the plan includes a boolean capability. */
export function requireEntitlement(
  plan: Plan,
  capability: BooleanEntitlement,
): void {
  if (!PLAN_ENTITLEMENTS[plan][capability]) {
    throw new EntitlementError(capability);
  }
}

/** Throw when a countable cap (seats, monthly invoices) would be exceeded. */
export function requireWithinCap(
  plan: Plan,
  cap: "monthlyInvoiceCap" | "seatCap",
  currentCount: number,
): void {
  const limit = PLAN_ENTITLEMENTS[plan][cap];
  if (limit !== null && currentCount >= limit) {
    throw new EntitlementError(cap);
  }
}
