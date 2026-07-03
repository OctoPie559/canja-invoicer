/**
 * Environment access lives here, not scattered through services
 * (ARCHITECTURE.md §1.1). Services receive values or read them via these
 * helpers; adapters own their provider-specific env vars.
 */

/** Public base URL of the app (links in emails, hosted views). */
export function appBaseUrl(): string {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}
