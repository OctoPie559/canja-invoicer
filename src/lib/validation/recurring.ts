import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "./currencies";
import { invoiceLineSchema } from "./invoices";
import { RECURRING_FREQUENCIES } from "@/lib/domain/recurring-schedule";

/** Shared client/server schemas; the server re-parses every input (§5.2). */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const scheduleFields = {
  customerId: z.string().min(1, "Choose a customer"),
  currency: z.enum(SUPPORTED_CURRENCIES),
  frequency: z.enum(RECURRING_FREQUENCIES),
  intervalCount: z.coerce.number().int().min(1).max(60).default(1),
  /** first run (yyyy-mm-dd) */
  startDate: z.string().regex(ISO_DATE, "Invalid start date"),
  endDate: z
    .string()
    .regex(ISO_DATE, "Invalid end date")
    .nullish()
    .or(z.literal("").transform(() => null)),
  /** each run generates a draft, or issues automatically */
  autoIssue: z.enum(["draft", "issue"]).default("draft"),
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
  lines: z.array(invoiceLineSchema).min(1, "Add at least one line item").max(100),
};

export const createRecurringSchema = z.object(scheduleFields);
export type CreateRecurringInput = z.input<typeof createRecurringSchema>;

export const updateRecurringSchema = z.object({
  id: z.string().min(1),
  version: z.coerce.number().int().positive(),
  ...scheduleFields,
});
export type UpdateRecurringInput = z.input<typeof updateRecurringSchema>;

export const recurringActionSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["pause", "resume", "end"]),
});
export type RecurringActionInput = z.input<typeof recurringActionSchema>;
