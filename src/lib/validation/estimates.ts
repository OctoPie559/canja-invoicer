import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "./currencies";
import { invoiceLineSchema } from "./invoices";

/** Shared client/server schemas; the server re-parses every input (§5.2). */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const draftFields = {
  customerId: z.string().min(1, "Choose a customer"),
  currency: z.enum(SUPPORTED_CURRENCIES),
  issueDate: z
    .string()
    .regex(ISO_DATE, "Invalid date")
    .nullish()
    .or(z.literal("").transform(() => null)),
  expiryDate: z
    .string()
    .regex(ISO_DATE, "Invalid date")
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
  // estimates share the invoice line shape (description, qty, price,
  // discount bps, tax bps) — same math module computes both
  lines: z.array(invoiceLineSchema).min(1, "Add at least one line item").max(100),
};

export const createEstimateDraftSchema = z.object(draftFields);
export type CreateEstimateDraftInput = z.input<typeof createEstimateDraftSchema>;

export const updateEstimateDraftSchema = z.object({
  id: z.string().min(1),
  version: z.coerce.number().int().positive(),
  ...draftFields,
});
export type UpdateEstimateDraftInput = z.input<typeof updateEstimateDraftSchema>;

export const deleteEstimateDraftSchema = z.object({
  id: z.string().min(1),
  version: z.coerce.number().int().positive(),
});
export type DeleteEstimateDraftInput = z.input<typeof deleteEstimateDraftSchema>;

export const issueEstimateSchema = z.object({
  id: z.string().min(1),
  version: z.coerce.number().int().positive(),
  issueDate: z.string().regex(ISO_DATE, "Invalid issue date"),
  expiryDate: z.string().regex(ISO_DATE, "Invalid expiry date"),
});
export type IssueEstimateInput = z.input<typeof issueEstimateSchema>;

export const estimateDecisionSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["accepted", "declined", "expired"]),
});
export type EstimateDecisionInput = z.input<typeof estimateDecisionSchema>;

export const convertEstimateSchema = z.object({
  id: z.string().min(1),
  version: z.coerce.number().int().positive(),
});
export type ConvertEstimateInput = z.input<typeof convertEstimateSchema>;

export const sendEstimateSchema = z.object({
  id: z.string().min(1),
  contactIds: z
    .array(z.string().min(1))
    .min(1, "Choose at least one recipient")
    .max(10),
});
export type SendEstimateInput = z.input<typeof sendEstimateSchema>;
