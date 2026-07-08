import { z } from "zod";

/** Shared client/server schemas; the server re-parses every input (§5.2). */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const QUANTITY = /^\d{1,9}(\.\d{1,3})?$/;

/** Credit-note lines: like invoice lines but with no percentage discount —
 * a credit IS the adjustment, so a discount-on-a-credit is noise. */
export const creditNoteLineSchema = z.object({
  description: z.string().trim().min(1, "Line description is required").max(500),
  quantity: z
    .string()
    .trim()
    .regex(QUANTITY, "Quantity must be a positive number (up to 3 decimals)")
    .refine((q) => Number(q) > 0, "Quantity must be greater than zero"),
  unitPrice: z.string().trim().min(1, "Unit price is required"),
  taxRateBps: z.coerce.number().int().min(0).max(10_000).default(0),
});
export type CreditNoteLineInput = z.input<typeof creditNoteLineSchema>;

export const createCreditNoteSchema = z.object({
  invoiceId: z.string().min(1),
  reason: z
    .string()
    .trim()
    .max(1000)
    .transform((v) => (v === "" ? null : v))
    .nullish(),
  lines: z
    .array(creditNoteLineSchema)
    .min(1, "Add at least one line item")
    .max(100),
});
export type CreateCreditNoteInput = z.input<typeof createCreditNoteSchema>;

export const updateCreditNoteSchema = z.object({
  id: z.string().min(1),
  version: z.coerce.number().int().positive(),
  reason: z
    .string()
    .trim()
    .max(1000)
    .transform((v) => (v === "" ? null : v))
    .nullish(),
  lines: z
    .array(creditNoteLineSchema)
    .min(1, "Add at least one line item")
    .max(100),
});
export type UpdateCreditNoteInput = z.input<typeof updateCreditNoteSchema>;

export const deleteCreditNoteSchema = z.object({
  id: z.string().min(1),
  version: z.coerce.number().int().positive(),
});
export type DeleteCreditNoteInput = z.input<typeof deleteCreditNoteSchema>;

export const issueCreditNoteSchema = z.object({
  id: z.string().min(1),
  version: z.coerce.number().int().positive(),
  issueDate: z.string().regex(ISO_DATE, "Invalid issue date"),
});
export type IssueCreditNoteInput = z.input<typeof issueCreditNoteSchema>;

export const voidCreditNoteSchema = z.object({
  id: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(3, "A reason is required to void a credit note")
    .max(1000),
});
export type VoidCreditNoteInput = z.input<typeof voidCreditNoteSchema>;
