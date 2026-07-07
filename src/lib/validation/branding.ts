import { z } from "zod";

/** Shared client/server schemas; the server re-parses every input (§5.2). */

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullish();

export const updateBrandingSchema = z.object({
  version: z.coerce.number().int().positive(),
  legalName: optionalTrimmed(160),
  addressLine1: optionalTrimmed(200),
  addressLine2: optionalTrimmed(200),
  city: optionalTrimmed(100),
  country: optionalTrimmed(100),
  kraPin: optionalTrimmed(20),
  contactEmail: z
    .string()
    .trim()
    .email("Invalid email")
    .max(254)
    .nullish()
    .or(z.literal("").transform(() => null)),
  /** MSISDN — masked in every log path, printed only on documents */
  contactPhone: optionalTrimmed(20),
  accentColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #103B05")
    .nullish()
    .or(z.literal("").transform(() => null)),
});
export type UpdateBrandingInput = z.input<typeof updateBrandingSchema>;

/** Logo uploads: small raster images only. */
export const LOGO_MAX_BYTES = 512 * 1024;
export const LOGO_CONTENT_TYPES = ["image/png", "image/jpeg"] as const;
