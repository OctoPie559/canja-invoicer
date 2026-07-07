import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/domain/errors";
import {
  assertTransition,
  canTransition,
  isDeletable,
  isEditable,
  isOutstanding,
  isVoidable,
  type InvoiceStatus,
} from "@/lib/domain/invoice-status";

const ALL: InvoiceStatus[] = [
  "draft",
  "sent",
  "partial",
  "paid",
  "overdue",
  "void",
];

describe("invoice status machine", () => {
  it("allows exactly the documented transitions", () => {
    const allowed: Array<[InvoiceStatus, InvoiceStatus]> = [
      ["draft", "sent"],
      ["sent", "partial"],
      ["sent", "paid"],
      ["sent", "overdue"],
      ["sent", "void"],
      ["partial", "paid"],
      ["partial", "overdue"],
      ["partial", "void"],
      ["overdue", "partial"],
      ["overdue", "paid"],
      ["overdue", "void"],
    ];
    for (const from of ALL) {
      for (const to of ALL) {
        const expected = allowed.some(([f, t]) => f === from && t === to);
        expect(canTransition(from, to), `${from} → ${to}`).toBe(expected);
      }
    }
  });

  it("drafts are never voided — they are deleted", () => {
    expect(canTransition("draft", "void")).toBe(false);
    expect(isDeletable("draft")).toBe(true);
    expect(isVoidable("draft")).toBe(false);
  });

  it("paid and void are terminal", () => {
    for (const to of ALL) {
      expect(canTransition("paid", to)).toBe(false);
      expect(canTransition("void", to)).toBe(false);
    }
  });

  it("issued documents are never editable or deletable", () => {
    for (const s of ALL.filter((s) => s !== "draft")) {
      expect(isEditable(s)).toBe(false);
      expect(isDeletable(s)).toBe(false);
    }
    expect(isEditable("draft")).toBe(true);
  });

  it("assertTransition throws a ValidationError on illegal moves", () => {
    expect(() => assertTransition("paid", "sent")).toThrow(ValidationError);
    expect(() => assertTransition("draft", "paid")).toThrow(ValidationError);
    expect(() => assertTransition("sent", "paid")).not.toThrow();
  });

  it("outstanding covers exactly the collectible statuses", () => {
    expect(ALL.filter(isOutstanding)).toEqual(["sent", "partial", "overdue"]);
  });
});
