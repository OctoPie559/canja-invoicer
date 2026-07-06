/**
 * Currencies offered in the UI. The Money value object accepts any ISO 4217
 * code; this list is a product choice (Kenya-first plus common invoicing
 * currencies) shared by client selects and server validation.
 */
export const SUPPORTED_CURRENCIES = [
  "KES",
  "USD",
  "EUR",
  "GBP",
  "TZS",
  "UGX",
  "RWF",
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
