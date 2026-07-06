import { z } from "zod";

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

export const contactFields = {
  salutation: optionalTrimmed(20),
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: optionalTrimmed(80),
  email: z
    .email()
    .toLowerCase()
    .nullish()
    .or(z.literal("").transform(() => null)),
  workPhone: phoneSchema,
  mobile: phoneSchema,
  designation: optionalTrimmed(80),
  department: optionalTrimmed(80),
};

export const createContactSchema = z.object({
  customerId: z.string().min(1),
  isPrimary: z.coerce.boolean().default(false),
  ...contactFields,
});
export type CreateContactInput = z.input<typeof createContactSchema>;

export const updateContactSchema = z.object({
  id: z.string().min(1),
  version: z.coerce.number().int().positive(),
  isPrimary: z.coerce.boolean().default(false),
  ...contactFields,
});
export type UpdateContactInput = z.input<typeof updateContactSchema>;

export const deleteContactSchema = z.object({
  id: z.string().min(1),
  version: z.coerce.number().int().positive(),
});
export type DeleteContactInput = z.input<typeof deleteContactSchema>;

/** Inline primary contact accepted when creating a customer. */
export const inlineContactSchema = z.object(contactFields);
export type InlineContactInput = z.input<typeof inlineContactSchema>;

/**
 * One row of the edit-customer contact grid. Existing rows carry id+version
 * (optimistic lock); new rows carry neither; removal is an explicit flag so
 * a client-side rendering bug can never silently delete people.
 */
export const contactRowSchema = z.object({
  id: z.string().min(1).nullish(),
  version: z.coerce.number().int().positive().nullish(),
  isPrimary: z.coerce.boolean().default(false),
  deleted: z.coerce.boolean().default(false),
  ...contactFields,
});
export type ContactRowInput = z.input<typeof contactRowSchema>;

export const contactRowsSchema = z
  .array(contactRowSchema)
  .max(20)
  .refine(
    (rows) => rows.filter((r) => r.isPrimary && !r.deleted).length <= 1,
    "Only one contact person can be primary",
  );
