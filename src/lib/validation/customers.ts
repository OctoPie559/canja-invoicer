import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "./currencies";
import { inlineContactSchema } from "./contacts";

/**
 * Shared client/server schemas; the server re-parses every input (§5.2).
 * Customers are companies/individuals — person-level contact info lives on
 * customer_contacts (decision, 2026-07-05).
 */

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullish();

const customerFields = {
  name: z.string().trim().min(2).max(160),
  customerType: z.enum(["business", "individual"]).default("business"),
  addressLine1: optionalTrimmed(200),
  addressLine2: optionalTrimmed(200),
  city: optionalTrimmed(100),
  country: optionalTrimmed(100),
  shippingAddressLine1: optionalTrimmed(200),
  shippingAddressLine2: optionalTrimmed(200),
  shippingCity: optionalTrimmed(100),
  shippingCountry: optionalTrimmed(100),
  notes: optionalTrimmed(2000),
  preferredCurrency: z
    .enum(SUPPORTED_CURRENCIES)
    .nullish()
    .or(z.literal("").transform(() => null)),
  /** default payment terms in days; null = organization default */
  paymentTermsDays: z.coerce
    .number()
    .int()
    .min(0)
    .max(365)
    .nullish()
    .or(z.literal("").transform(() => null)),
};

export const createCustomerSchema = z.object({
  ...customerFields,
  /** Optional primary contact person, created in the same transaction. */
  primaryContact: inlineContactSchema.nullish(),
});
export type CreateCustomerInput = z.input<typeof createCustomerSchema>;

export const updateCustomerSchema = z.object({
  id: z.string().min(1),
  /** optimistic lock — the version the client loaded */
  version: z.coerce.number().int().positive(),
  ...customerFields,
});
export type UpdateCustomerInput = z.input<typeof updateCustomerSchema>;

export const deleteCustomerSchema = z.object({
  id: z.string().min(1),
  version: z.coerce.number().int().positive(),
});
export type DeleteCustomerInput = z.input<typeof deleteCustomerSchema>;
