import { z } from "zod";

/**
 * Ask Canja schemas (slice 9). The router LLM fills a FLAT extraction object
 * (strict JSON schema on the API call); the server re-parses it here and then
 * narrows per intent — the LLM's output is never trusted or executed raw.
 */

export const askQuestionSchema = z.object({
  sessionId: z.string().min(1).optional(),
  question: z.string().trim().min(1).max(500),
});
export type AskQuestionInput = z.input<typeof askQuestionSchema>;

/** Phase-1 intent set. `unsupported` is a first-class outcome, not an error. */
export const INTENTS = [
  "financial_overview",
  "outstanding_balance",
  "overdue_list",
  "revenue_by_period",
  "payment_status",
  "top_customers",
  "aging_breakdown",
  "unsupported",
] as const;
export type Intent = (typeof INTENTS)[number];

export const PERIOD_SYMBOLS = [
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
  "this_year",
  "last_year",
  "all_time",
] as const;
export type PeriodSymbol = (typeof PERIOD_SYMBOLS)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date expected");

/** Symbolic period or explicit range — date MATH happens in code, never LLM. */
export const periodSchema = z.union([
  z.enum(PERIOD_SYMBOLS),
  z.object({ from: isoDate, to: isoDate }),
]);
export type Period = z.infer<typeof periodSchema>;

/**
 * The flat envelope the router model produces. Every param is nullable so one
 * strict schema covers all intents; per-intent narrowing below decides which
 * fields matter.
 */
export const routerExtractionSchema = z.object({
  intent: z.enum(INTENTS),
  customerRef: z.string().nullable(),
  invoiceRef: z.string().nullable(),
  period: z.enum(PERIOD_SYMBOLS).nullable(),
  from: isoDate.nullable(),
  to: isoDate.nullable(),
  metric: z.enum(["invoiced", "collected"]).nullable(),
  by: z.enum(["outstanding", "billed"]).nullable(),
  limit: z.number().int().min(1).max(20).nullable(),
  reason: z.enum(["out_of_scope", "needs_semantic", "ambiguous"]).nullable(),
});
export type RouterExtraction = z.infer<typeof routerExtractionSchema>;

/** The strict json_schema sent to OpenAI — mirror of routerExtractionSchema. */
export const ROUTER_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "intent",
    "customerRef",
    "invoiceRef",
    "period",
    "from",
    "to",
    "metric",
    "by",
    "limit",
    "reason",
  ],
  properties: {
    intent: { type: "string", enum: [...INTENTS] },
    customerRef: { type: ["string", "null"] },
    invoiceRef: { type: ["string", "null"] },
    period: { type: ["string", "null"], enum: [...PERIOD_SYMBOLS, null] },
    from: { type: ["string", "null"] },
    to: { type: ["string", "null"] },
    metric: { type: ["string", "null"], enum: ["invoiced", "collected", null] },
    by: { type: ["string", "null"], enum: ["outstanding", "billed", null] },
    limit: { type: ["integer", "null"] },
    reason: {
      type: ["string", "null"],
      enum: ["out_of_scope", "needs_semantic", "ambiguous", null],
    },
  },
};

// ---- per-intent params (ARCHITECTURE plan §2): what each query needs -------

export const intentParamsSchemas = {
  financial_overview: z.object({}),
  outstanding_balance: z.object({ customerRef: z.string().min(1).nullable() }),
  overdue_list: z.object({ limit: z.number().int().min(1).max(20) }),
  revenue_by_period: z.object({
    period: periodSchema,
    metric: z.enum(["invoiced", "collected"]),
  }),
  payment_status: z.object({ invoiceRef: z.string().min(1) }),
  top_customers: z.object({
    by: z.enum(["outstanding", "billed"]),
    limit: z.number().int().min(1).max(10),
  }),
  aging_breakdown: z.object({}),
  unsupported: z.object({
    reason: z.enum(["out_of_scope", "needs_semantic", "ambiguous"]),
  }),
} satisfies Record<Intent, z.ZodTypeAny>;

export type IntentParams = {
  [K in Intent]: { intent: K; params: z.infer<(typeof intentParamsSchemas)[K]> };
}[Intent];

/**
 * Narrow a validated flat extraction into typed per-intent params, applying
 * defaults. Missing REQUIRED fields (e.g. payment_status without an invoice
 * reference) degrade to `unsupported/ambiguous` — an honest clarification
 * beats a guess.
 */
export function narrowExtraction(e: RouterExtraction): IntentParams {
  const ambiguous = {
    intent: "unsupported",
    params: { reason: "ambiguous" },
  } as const;

  switch (e.intent) {
    case "financial_overview":
      return { intent: e.intent, params: {} };
    case "outstanding_balance":
      return { intent: e.intent, params: { customerRef: e.customerRef } };
    case "overdue_list":
      return { intent: e.intent, params: { limit: e.limit ?? 10 } };
    case "revenue_by_period": {
      // no stated time frame = all time (the answer names the period, so a
      // safe default beats bouncing the user with "ambiguous")
      const period: Period =
        e.period ?? (e.from && e.to ? { from: e.from, to: e.to } : "all_time");
      if (!e.metric) return ambiguous;
      return { intent: e.intent, params: { period, metric: e.metric } };
    }
    case "payment_status":
      if (!e.invoiceRef) return ambiguous;
      return { intent: e.intent, params: { invoiceRef: e.invoiceRef } };
    case "top_customers":
      return {
        intent: e.intent,
        params: { by: e.by ?? "outstanding", limit: Math.min(e.limit ?? 5, 10) },
      };
    case "aging_breakdown":
      return { intent: e.intent, params: {} };
    case "unsupported":
      return { intent: e.intent, params: { reason: e.reason ?? "out_of_scope" } };
  }
}
