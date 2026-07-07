/**
 * Payment terms vocabulary (Zoho-style). A term is just "days until due";
 * the named presets are product vocabulary over that number. Stored on
 * customers (their default) and on invoices (what the document was billed
 * under) as plain integer days — null means a custom due date was chosen.
 */

export interface PaymentTermsPreset {
  label: string;
  days: number;
}

export const PAYMENT_TERMS_PRESETS: readonly PaymentTermsPreset[] = [
  { label: "Due on receipt", days: 0 },
  { label: "Net 7", days: 7 },
  { label: "Net 14", days: 14 },
  { label: "Net 30", days: 30 },
  { label: "Net 45", days: 45 },
  { label: "Net 60", days: 60 },
];

/** "Net 30" for a preset, "Net 23" style for anything else, honest at 0. */
export function paymentTermsLabel(days: number): string {
  return (
    PAYMENT_TERMS_PRESETS.find((p) => p.days === days)?.label ?? `Net ${days}`
  );
}

/** Due date = issue date + terms days, both as ISO yyyy-mm-dd strings. */
export function dueDateFor(issueDate: string, termsDays: number): string {
  const d = new Date(`${issueDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + termsDays);
  return d.toISOString().slice(0, 10);
}
