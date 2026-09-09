import { describe, expect, it } from "vitest";
import { slugify } from "../src/common/plans";
import { PlanLimitsService } from "../src/common/plan-limits.service";

describe("slugify (signup wizard)", () => {
  it("basic names", () => {
    expect(slugify("Sky Eco Group")).toBe("sky-eco-group");
    expect(slugify("  Riverside--Resort & Spa!! ")).toBe("riverside-resort-spa");
  });
  it("handles diacritics + caps length", () => {
    expect(slugify("Café Del Mar")).toBe("cafe-del-mar");
    expect(slugify("a".repeat(100))).toHaveLength(60);
  });
  it("empty after strip → empty string", () => {
    expect(slugify("???")).toBe("");
  });
});

describe("plan limits", () => {
  const limits = (label: string, maxRooms: number) => ({ label, maxRooms, maxResorts: 1, source: "tenant" as const });

  it("allows a room while there is room in the plan", () => {
    expect(PlanLimitsService.roomCapError(limits("Free", 10), 9)).toBeNull();
    expect(PlanLimitsService.roomCapError(limits("Standard", 50), 10)).toBeNull();
  });
  it("explains which plan ran out and how many rooms it allows", () => {
    expect(PlanLimitsService.roomCapError(limits("Free", 10), 10)).toMatch(/Free allows up to 10 rooms/);
  });
  it("caps resorts the same way", () => {
    expect(PlanLimitsService.resortCapError({ label: "Starter", maxRooms: 10, maxResorts: 1, source: "subscription" }, 1))
      .toMatch(/Starter plan allows up to 1 resort/);
  });
  // The FREE/STANDARD/PRO constant this used to guard is gone: those names are
  // rows in platform_plans now, and which names exist is a question for the
  // database, answered in plan-vocabulary.spec.ts.
});
