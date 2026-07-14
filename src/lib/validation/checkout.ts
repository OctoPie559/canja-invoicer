import { z } from "zod";
import { BILLING_INTERVALS } from "@/lib/authz/plan-pricing";

/** Shared client/server schemas; the server re-parses every input (§5.2). */

export const startSubscriptionCheckoutSchema = z.object({
  interval: z.enum(BILLING_INTERVALS),
});
export type StartSubscriptionCheckoutInput = z.input<
  typeof startSubscriptionCheckoutSchema
>;

export const startInvoiceCheckoutSchema = z.object({
  token: z.string().min(20),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type StartInvoiceCheckoutInput = z.input<
  typeof startInvoiceCheckoutSchema
>;
