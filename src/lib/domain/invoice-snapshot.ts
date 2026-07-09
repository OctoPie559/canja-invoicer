/**
 * The Layer-2 issue snapshot (brief §5.3), exactly as issueInvoice writes
 * it (money as strings — jsonSafe stringifies bigint for JSONB). The PDF
 * and the hosted public view render from THIS shape and nothing else, so
 * issued documents are immune to later customer/branding/rate edits.
 */

export interface SnapshotLine {
  description: string;
  quantity: string;
  unitPriceMinor: string;
  discountBps?: number;
  taxRateBps: number;
  lineTotalMinor: string;
  position: number;
}

export interface InvoiceSnapshot {
  customer: {
    name: string;
    customerType: string;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    country: string | null;
    shippingAddressLine1: string | null;
    shippingAddressLine2: string | null;
    shippingCity: string | null;
    shippingCountry: string | null;
    primaryContact: {
      firstName: string;
      lastName: string | null;
      email: string | null;
    } | null;
  };
  branding: {
    legalName: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    country: string | null;
    kraPin: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    accentColor: string | null;
    logoKey: string | null;
  } | null;
  lines: SnapshotLine[];
  totals: {
    subtotalMinor: string;
    discountTotalMinor?: string;
    taxTotalMinor: string;
    totalMinor: string;
  };
  currency: string;
  baseCurrency: string;
  fxRateToBase?: string | null;
  issueDate: string;
  /** invoices: due date; estimates map their expiry here for rendering */
  dueDate?: string;
  paymentTermsDays?: number | null;
  displayNumber: string;
  notes: string | null;
  terms: string | null;
  /** PDF layout frozen at issue; absent on pre-template documents (classic) */
  pdfTemplate?: string;
}

export function parseInvoiceSnapshot(value: unknown): InvoiceSnapshot {
  if (!value || typeof value !== "object") {
    throw new Error("Invoice has no snapshot — was it issued?");
  }
  return value as InvoiceSnapshot;
}
