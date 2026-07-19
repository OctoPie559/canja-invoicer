/**
 * Sanitize a post-auth `?redirect=` target. Only same-origin relative paths
 * are allowed — never an absolute or protocol-relative URL — so the redirect
 * can't be used for phishing. Falls back to the dashboard.
 */
export function safeRedirect(raw: string | null | undefined): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/dashboard";
}
