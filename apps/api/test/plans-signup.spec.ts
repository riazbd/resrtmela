import { describe, expect, it } from "vitest";
import { slugify, checkRoomCap, PLANS, isPlanName } from "../src/common/plans";

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
  it("caps enforced per plan", () => {
    expect(checkRoomCap("FREE", 9)).toBeNull();
    expect(checkRoomCap("FREE", 10)).toMatch(/10 rooms/);
    expect(checkRoomCap("STANDARD", 10)).toBeNull();
    expect(checkRoomCap("PRO", 499)).toBeNull();
  });
  it("unknown plan falls back to FREE", () => {
    expect(checkRoomCap("whatever", 10)).toMatch(/10 rooms/);
  });
  it("plan names", () => {
    expect(isPlanName("PRO")).toBe(true);
    expect(isPlanName("pro")).toBe(false);
    expect(PLANS.FREE.maxResorts).toBe(1);
  });
});
