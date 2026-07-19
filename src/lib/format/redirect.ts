/**
 * Sanitize a post-auth `?redirect=` target. Only a same-origin absolute path
 * is allowed — never an absolute or protocol-relative URL — so the redirect
 * can't be used for phishing. Falls back to the dashboard.
 */
export function safeRedirect(raw: string | null | undefined): string {
  if (!raw) return "/dashboard";
  // Must start with exactly one slash. Reject "//host" AND "/\host": the URL
  // parser treats backslash as slash for http(s), so "/\evil.com" resolves to
  // https://evil.com — an open redirect.
  if (raw[0] !== "/" || raw[1] === "/" || raw[1] === "\\") return "/dashboard";
  // Reject any control character or whitespace (codepoint ≤ 0x20, or DEL) that
  // could smuggle a scheme or host past the checks above.
  for (const ch of raw) {
    if (ch.codePointAt(0)! <= 0x20 || ch === "\x7f") return "/dashboard";
  }
  return raw;
}
