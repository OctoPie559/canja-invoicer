import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "./currencies";

/** Shared client/server schemas; the server re-parses every input (§5.2). */

const QUANTITY = /^\d{1,9}(\.\d{1,3})?$/; // numeric(12,3), positive
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FX_RATE = /^\d{1,10}(\.\d{1,8})?$/; // numeric(18,8), positive

export const invoiceLineSchema = z.object({
  /** Optional link back to the catalog; description is what gets billed. */
  productId: z
    .string()
    .nullish()
    .or(z.literal("").transform(() => null)),
  description: z.string().trim().min(1, "Line description is required").max(500),
  quantity: z
    .string()
    .trim()
    .regex(QUANTITY, "Quantity must be a positive number (up to 3 decimals)")
    .refine((q) => Number(q) > 0, "Quantity must be greater than zero"),
  /** decimal string ("1500.00") — parsed into minor units by Money.parse */
  unitPrice: z.string().trim().min(1, "Unit price is required"),
  discountBps: z.coerce.number().int().min(0).max(10_000).default(0),
  taxRateBps: z.coerce.number().int().min(0).max(10_000).default(0),
});
export type InvoiceLineInput = z.input<typeof invoiceLineSchema>;

const draftFields = {
  customerId: z.string().min(1, "Choose a customer"),
  currency: z.enum(SUPPORTED_CURRENCIES),
  issueDate: z
    .string()
    .regex(ISO_DATE, "Invalid date")
    .nullish()
    .or(z.literal("").transform(() => null)),
  dueDate: z
    .string()
    .regex(ISO_DATE, "Invalid date")
    .nullish()
    .or(z.literal("").transform(() => null)),
  /** terms behind the due date, in days; null = custom due date */
  paymentTermsDays: z.coerce
    .number()
    .int()
    .min(0)
    .max(365)
    .nullish()
    .or(z.literal("").transform(() => null)),
  notes: z
    .string()
    .trim()
    .max(4000)
    .transform((v) => (v === "" ? null : v))
    .nullish(),
  terms: z
    .string()
    .trim()
    .max(4000)
    .transform((v) => (v === "" ? null : v))
    .nullish(),
  lines: z
    .array(invoiceLineSchema)
    .min(1, "Add at least one line item")
    .max(100),
};

export const createInvoiceDraftSchema = z.object(draftFields);
export type CreateInvoiceDraftInput = z.input<typeof createInvoiceDraftSchema>;

export const updateInvoiceDraftSchema = z.object({
  id: z.string().min(1),
  version: z.coerce.number().int().positive(),
  ...draftFields,
});
export type UpdateInvoiceDraftInput = z.input<typeof updateInvoiceDraftSchema>;

export const deleteInvoiceDraftSchema = z.object({
  id: z.string().min(1),
  version: z.coerce.number().int().positive(),
});
export type DeleteInvoiceDraftInput = z.input<typeof deleteInvoiceDraftSchema>;

/**
 * Issue finalizes the draft: dates become real, and a foreign-currency
 * invoice must carry its FX rate to base (§5.6 — manual entry first).
 * Whether the rate is REQUIRED depends on the org's base currency, which
 * only the service knows — enforced there, not here.
 */
export const issueInvoiceSchema = z.object({
  id: z.string().min(1),
  version: z.coerce.number().int().positive(),
  issueDate: z.string().regex(ISO_DATE, "Invalid issue date"),
  dueDate: z.string().regex(ISO_DATE, "Invalid due date"),
  fxRateToBase: z
    .string()
    .trim()
    .regex(FX_RATE, "FX rate must be a positive decimal (up to 8 dp)")
    .refine((r) => Number(r) > 0, "FX rate must be greater than zero")
    .nullish()
    .or(z.literal("").transform(() => null)),
});
export type IssueInvoiceInput = z.input<typeof issueInvoiceSchema>;

export const voidInvoiceSchema = z.object({
  id: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(3, "A reason is required to void an issued invoice")
    .max(1000),
});
export type VoidInvoiceInput = z.input<typeof voidInvoiceSchema>;

/**
 * Recipients are chosen from the customer's contact persons — never free
 * text — so our sending domain can't be used to mail arbitrary addresses.
 */
export const sendInvoiceSchema = z.object({
  id: z.string().min(1),
  contactIds: z
    .array(z.string().min(1))
    .min(1, "Choose at least one recipient")
    .max(10),
});
export type SendInvoiceInput = z.input<typeof sendInvoiceSchema>;
