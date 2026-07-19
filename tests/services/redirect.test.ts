import { describe, expect, it } from "vitest";
import { safeRedirect } from "@/lib/format/redirect";

describe("safeRedirect (open-redirect guard)", () => {
  it("allows same-origin absolute paths", () => {
    expect(safeRedirect("/dashboard")).toBe("/dashboard");
    expect(safeRedirect("/orgs/abc/settings/members")).toBe(
      "/orgs/abc/settings/members",
    );
    expect(safeRedirect("/invitations/inv_1?x=1")).toBe("/invitations/inv_1?x=1");
  });

  it("rejects protocol-relative, absolute, and backslash escapes", () => {
    for (const bad of [
      "//evil.com",
      "/\\evil.com", // URL parser resolves this to https://evil.com
      "https://evil.com",
      "http://evil.com",
      "javascript:alert(1)",
      "evil.com",
      "\\\\evil.com",
      "/\tstuff",
      "/ /evil.com",
      "",
      null,
      undefined,
    ]) {
      expect(safeRedirect(bad)).toBe("/dashboard");
    }
  });

  it("the backslash escape does not resolve off-origin after sanitizing", () => {
    const origin = "https://app.canja.co";
    expect(new URL(safeRedirect("/\\evil.com"), origin).origin).toBe(origin);
    expect(new URL(safeRedirect("//evil.com"), origin).origin).toBe(origin);
  });
});
