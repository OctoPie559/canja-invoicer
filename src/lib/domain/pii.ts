/**
 * MSISDN (phone number) masking — Kenya DPA 2019 (PROJECT_BRIEF.md §7).
 * Phone numbers are personal data and must never appear unmasked in logs,
 * error reports, or Sentry events.
 */

/** Kenyan and international MSISDN shapes: +2547..., 2547..., 07..., 011... */
const MSISDN_PATTERN = /(?<![\d])(\+?\d{1,3})?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{3,4}(?![\d])/g;

/** Mask a known phone value: keep country code hint and last 2 digits. */
export function maskMsisdn(msisdn: string): string {
  const digits = msisdn.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `${msisdn.startsWith("+") ? "+" : ""}${digits.slice(0, 3)}****${digits.slice(-2)}`;
}

/** Scrub anything phone-shaped from free text (log lines, error messages). */
export function maskPiiInText(text: string): string {
  return text.replace(MSISDN_PATTERN, (match) => maskMsisdn(match));
}
