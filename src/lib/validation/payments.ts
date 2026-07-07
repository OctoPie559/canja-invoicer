import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "./currencies";

/** Shared client/server schemas; the server re-parses every input (§5.2). */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FX_RATE = /^\d{1,10}(\.\d{1,8})?$/;

export const PAYMENT_METHODS = [
  "mpesa",
  "bank",
  "cash",
  "card",
  "other",
] as const;

export const recordPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  /** decimal string in the payment's own currency, e.g. "1500.00" */
  amount: z.string().trim().min(1, "Amount is required"),
  currency: z.enum(SUPPORTED_CURRENCIES),
  /** payment currency → invoice currency; required iff currencies differ */
  fxRateUsed: z
    .string()
    .trim()
    .regex(FX_RATE, "Rate must be a positive decimal (up to 8 dp)")
    .refine((r) => Number(r) > 0, "Rate must be greater than zero")
    .nullish()
    .or(z.literal("").transform(() => null)),
  method: z.enum(PAYMENT_METHODS),
  paidAt: z
    .string()
    .regex(ISO_DATE, "Invalid payment date")
    .refine(
      (d) => d >= "2000-01-01" && d <= "2100-12-31",
      "Payment date out of range",
    ),
  /** e.g. an M-Pesa confirmation code — kept on the record, masked in logs */
  reference: z
    .string()
    .trim()
    .max(100)
    .transform((v) => (v === "" ? null : v))
    .nullish(),
  notes: z
    .string()
    .trim()
    .max(1000)
    .transform((v) => (v === "" ? null : v))
    .nullish(),
});
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;
