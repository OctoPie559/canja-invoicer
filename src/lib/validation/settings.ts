import { z } from "zod";

/** Shared client/server schemas; the server re-parses every input (§5.2). */

export const createTaxRateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  /** basis points: 1600 = 16.00% */
  rateBps: z.coerce.number().int().min(0).max(10_000),
});
export type CreateTaxRateInput = z.input<typeof createTaxRateSchema>;

export const updateTaxRateSchema = z.object({
  id: z.string().min(1),
  version: z.coerce.number().int().positive(),
  name: z.string().trim().min(1, "Name is required").max(80),
  rateBps: z.coerce.number().int().min(0).max(10_000),
});
export type UpdateTaxRateInput = z.input<typeof updateTaxRateSchema>;

export const deleteTaxRateSchema = z.object({
  id: z.string().min(1),
  version: z.coerce.number().int().positive(),
});
export type DeleteTaxRateInput = z.input<typeof deleteTaxRateSchema>;

export const updateInvoiceNumberingSchema = z.object({
  version: z.coerce.number().int().positive(),
  invoicePrefix: z
    .string()
    .trim()
    .min(1, "Prefix is required")
    .max(10)
    .regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only"),
  invoiceNextNumber: z.coerce.number().int().min(1),
});
export type UpdateInvoiceNumberingInput = z.input<
  typeof updateInvoiceNumberingSchema
>;

export const updatePaymentTermsDefaultSchema = z.object({
  version: z.coerce.number().int().positive(),
  defaultPaymentTermsDays: z.coerce.number().int().min(0).max(365),
});
export type UpdatePaymentTermsDefaultInput = z.input<
  typeof updatePaymentTermsDefaultSchema
>;

export const updateInvoiceDefaultsSchema = z.object({
  version: z.coerce.number().int().positive(),
  defaultTaxRateId: z
    .string()
    .nullish()
    .or(z.literal("").transform(() => null))
    .or(z.literal("none").transform(() => null)),
  defaultInvoiceNotes: z
    .string()
    .trim()
    .max(4000)
    .transform((v) => (v === "" ? null : v))
    .nullish(),
  defaultInvoiceTerms: z
    .string()
    .trim()
    .max(4000)
    .transform((v) => (v === "" ? null : v))
    .nullish(),
});
export type UpdateInvoiceDefaultsInput = z.input<
  typeof updateInvoiceDefaultsSchema
>;
