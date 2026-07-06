/**
 * Environment access lives here, not scattered through services
 * (ARCHITECTURE.md §1.1). Services receive values or read them via these
 * helpers; adapters own their provider-specific env vars.
 */

/** Public base URL of the app (links in emails, hosted views). */
export function appBaseUrl(): string {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

/**
 * Base URL email images are served from. Email clients fetch images through
 * their own proxies, so this must be PUBLICLY reachable — appBaseUrl works
 * once deployed, but from local dev (localhost) images in delivered emails
 * will not load unless EMAIL_ASSET_BASE_URL points at a deployed origin.
 */
export function emailAssetBaseUrl(): string {
  return process.env.EMAIL_ASSET_BASE_URL ?? appBaseUrl();
}
