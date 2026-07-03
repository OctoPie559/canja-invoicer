import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "./currencies";

/** Shared client/server schemas; the server re-parses every input (§5.2). */

const productFields = {
  name: z.string().trim().min(2).max(160),
  description: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => (v === "" ? null : v))
    .nullish(),
  unitLabel: z
    .string()
    .trim()
    .max(40)
    .transform((v) => (v === "" ? null : v))
    .nullish(),
  /** decimal string ("1500.00") — parsed into minor units by Money.parse */
  unitPrice: z.string().trim().min(1, "Price is required"),
  currency: z.enum(SUPPORTED_CURRENCIES),
  defaultTaxRateId: z
    .string()
    .nullish()
    .or(z.literal("").transform(() => null)),
};

export const createProductSchema = z.object(productFields);
export type CreateProductInput = z.input<typeof createProductSchema>;

export const updateProductSchema = z.object({
  id: z.string().min(1),
  version: z.coerce.number().int().positive(),
  ...productFields,
});
export type UpdateProductInput = z.input<typeof updateProductSchema>;

export const deleteProductSchema = z.object({
  id: z.string().min(1),
  version: z.coerce.number().int().positive(),
});
export type DeleteProductInput = z.input<typeof deleteProductSchema>;
