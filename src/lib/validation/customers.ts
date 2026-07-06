import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "./currencies";

/** Shared client/server schemas; the server re-parses every input (§5.2). */

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullish();

/** Loose MSISDN shape — normalization/strictness is a later refinement. */
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[\d\s()-]{7,20}$/, "Enter a valid phone number")
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .nullish()
  .or(z.literal("").transform(() => null));

const customerFields = {
  name: z.string().trim().min(2).max(160),
  email: z
    .email()
    .toLowerCase()
    .nullish()
    .or(z.literal("").transform(() => null)),
  phone: phoneSchema,
  addressLine1: optionalTrimmed(200),
  addressLine2: optionalTrimmed(200),
  city: optionalTrimmed(100),
  country: optionalTrimmed(100),
  notes: optionalTrimmed(2000),
  preferredCurrency: z
    .enum(SUPPORTED_CURRENCIES)
    .nullish()
    .or(z.literal("").transform(() => null)),
};

export const createCustomerSchema = z.object(customerFields);
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
