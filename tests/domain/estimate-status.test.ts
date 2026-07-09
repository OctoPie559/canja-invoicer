import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/domain/errors";
import {
  assertEstimateTransition,
  canEstimateTransition,
  isEstimateConvertible,
  isEstimateDeletable,
  isEstimateEditable,
  type EstimateStatus,
} from "@/lib/domain/estimate-status";

const ALL: EstimateStatus[] = [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "declined",
  "expired",
  "converted",
];

describe("estimate status machine", () => {
  it("allows exactly the documented transitions", () => {
    const allowed: Array<[EstimateStatus, EstimateStatus]> = [
      ["draft", "sent"],
      ["sent", "viewed"],
      ["sent", "accepted"],
      ["sent", "declined"],
      ["sent", "expired"],
      ["viewed", "accepted"],
      ["viewed", "declined"],
      ["viewed", "expired"],
      ["accepted", "converted"],
      ["accepted", "declined"],
      ["declined", "accepted"],
      ["expired", "accepted"],
    ];
    for (const from of ALL) {
      for (const to of ALL) {
        const expected = allowed.some(([f, t]) => f === from && t === to);
        expect(canEstimateTransition(from, to), `${from} → ${to}`).toBe(expected);
      }
    }
  });

  it("only drafts are editable/deletable; only accepted converts", () => {
    expect(ALL.filter(isEstimateEditable)).toEqual(["draft"]);
    expect(ALL.filter(isEstimateDeletable)).toEqual(["draft"]);
    expect(ALL.filter(isEstimateConvertible)).toEqual(["accepted"]);
  });

  it("viewed advances only from sent; decisions open from sent or viewed", async () => {
    const { marksAsViewed, isAwaitingDecision } = await import(
      "@/lib/domain/estimate-status"
    );
    expect(ALL.filter(marksAsViewed)).toEqual(["sent"]);
    expect(ALL.filter(isAwaitingDecision)).toEqual(["sent", "viewed"]);
  });

  it("converted is terminal; asserts throw ValidationError", () => {
    for (const to of ALL) {
      expect(canEstimateTransition("converted", to)).toBe(false);
    }
    expect(() => assertEstimateTransition("draft", "accepted")).toThrow(
      ValidationError,
    );
    expect(() => assertEstimateTransition("sent", "accepted")).not.toThrow();
  });
});
