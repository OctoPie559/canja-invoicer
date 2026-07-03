import { describe, expect, it } from "vitest";
import { authorize, can } from "@/lib/authz/permissions";
import {
  requireEntitlement,
  requireWithinCap,
} from "@/lib/authz/entitlements";
import { EntitlementError, PermissionError } from "@/lib/domain/errors";

describe("role permission matrix", () => {
  it("viewer is read-only", () => {
    expect(can("viewer", "invoice.create")).toBe(false);
    expect(can("viewer", "customer.create")).toBe(false);
    expect(can("viewer", "member.invite")).toBe(false);
  });

  it("member can do billing work but not administration", () => {
    expect(can("member", "invoice.create")).toBe(true);
    expect(can("member", "invoice.issue")).toBe(true);
    expect(can("member", "payment.record")).toBe(true);
    expect(can("member", "member.invite")).toBe(false);
    expect(can("member", "invoice.void")).toBe(false);
    expect(can("member", "settings.update")).toBe(false);
  });

  it("admin can administer but not manage billing", () => {
    expect(can("admin", "member.invite")).toBe(true);
    expect(can("admin", "invoice.void")).toBe(true);
    expect(can("admin", "settings.update")).toBe(true);
    expect(can("admin", "billing.manage")).toBe(false);
  });

  it("owner can do everything an admin can, plus billing", () => {
    expect(can("owner", "billing.manage")).toBe(true);
    expect(can("owner", "member.role_change")).toBe(true);
    expect(can("owner", "invoice.issue")).toBe(true);
  });

  it("authorize throws a typed PermissionError", () => {
    expect(() => authorize("viewer", "invoice.create")).toThrow(
      PermissionError,
    );
    expect(() => authorize("owner", "invoice.create")).not.toThrow();
  });
});

describe("plan entitlements", () => {
  it("free plan lacks pro capabilities", () => {
    expect(() => requireEntitlement("free", "recurringInvoices")).toThrow(
      EntitlementError,
    );
    expect(() => requireEntitlement("free", "multiCurrency")).toThrow(
      EntitlementError,
    );
    expect(() => requireEntitlement("pro", "recurringInvoices")).not.toThrow();
  });

  it("enforces free-tier caps and pro unlimited invoices", () => {
    expect(() => requireWithinCap("free", "seatCap", 1)).toThrow(
      EntitlementError,
    );
    expect(() => requireWithinCap("free", "seatCap", 0)).not.toThrow();
    expect(() => requireWithinCap("free", "monthlyInvoiceCap", 20)).toThrow(
      EntitlementError,
    );
    expect(() =>
      requireWithinCap("pro", "monthlyInvoiceCap", 100_000),
    ).not.toThrow();
  });
});
