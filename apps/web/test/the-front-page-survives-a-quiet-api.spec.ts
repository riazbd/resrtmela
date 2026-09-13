/**
 * The public page is rendered on the server now, so the API is in its critical
 * path for the first time.
 *
 * Before, the prices arrived in the browser: if the API blinked, a visitor got
 * the marketing page with an empty price list. If a server component simply
 * awaits that fetch, the same blink is a 500 on the front door of the business
 * — the one page that has to be up even when the console is not.
 *
 * So the loader never throws. A failure costs the prices, which is what it used
 * to cost, and nothing else.
 */
import { describe, expect, it, vi } from "vitest";
import { fetchHomeData } from "@/app/(public)/home-data";

const ok = (body: unknown) =>
  ({ ok: true, json: async () => body }) as unknown as Response;

describe("loading the front page", () => {
  it("asks for both price lists, because the page shows both", async () => {
    const seen: string[] = [];
    const fake = vi.fn(async (url: string) => {
      seen.push(url);
      if (url.includes("audience=AGENCY")) return ok([priced("AGENCY_BASIC")]);
      if (url.includes("/cms/plans")) return ok([priced("STARTER")]);
      return ok({ "hero.title": "x" });
    });
    const data = await fetchHomeData("http://api", fake as unknown as typeof fetch);

    expect(seen.some((u) => u.includes("audience=RESORT"))).toBe(true);
    expect(seen.some((u) => u.includes("audience=AGENCY"))).toBe(true);
    expect(data.resortPlans[0]!.name).toBe("STARTER");
    expect(data.agencyPlans[0]!.name).toBe("AGENCY_BASIC");
    expect(data.cms["hero.title"]).toBe("x");
  });

  it("still returns a page when the API is down", async () => {
    const fake = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const data = await fetchHomeData("http://api", fake as unknown as typeof fetch);
    expect(data.cms).toEqual({});
    expect(data.resortPlans).toEqual([]);
    expect(data.agencyPlans).toEqual([]);
  });

  it("still returns a page when the API answers with rubbish", async () => {
    const fake = vi.fn(async () => ({ ok: true, json: async () => "not a list" }) as unknown as Response);
    const data = await fetchHomeData("http://api", fake as unknown as typeof fetch);
    expect(data.resortPlans).toEqual([]);
    expect(data.cms).toEqual({});
  });

  it("still returns a page on a 500", async () => {
    const fake = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response);
    const data = await fetchHomeData("http://api", fake as unknown as typeof fetch);
    expect(data.resortPlans).toEqual([]);
  });

  it("one list failing does not take the other down", async () => {
    const fake = vi.fn(async (url: string) => {
      if (url.includes("audience=AGENCY")) throw new Error("nope");
      if (url.includes("/cms/plans")) return ok([priced("STARTER")]);
      return ok({});
    });
    const data = await fetchHomeData("http://api", fake as unknown as typeof fetch);
    expect(data.resortPlans[0]!.name).toBe("STARTER");
    expect(data.agencyPlans).toEqual([]);
  });
});

/**
 * A plan with nowhere to keep a price.
 *
 * The guard here was `Array.isArray(v)`, which asserted `PublicPlan[]` while
 * checking nothing about the rows — so an array of anything satisfied it. That
 * was survivable while prices were two number fields, because a missing number
 * renders as blank. Prices are a list now, and the card iterates it: the first
 * plan without one threw during the static render and took **the whole front
 * page** down with it, which is precisely what this file exists to prevent.
 *
 * It happened for real, on a deploy — the page is prerendered at build time,
 * and at that moment the API still being asked was the old one, which had no
 * `schedules` field at all. A card with no price is not something to draw, so
 * the row is dropped and the rest of the list is still a page.
 */
describe("a plan the API sent without any prices", () => {
  it("is dropped rather than taking the whole page down", async () => {
    const fake = vi.fn(async (url: string) => {
      if (url.includes("/cms/plans")) return ok([{ name: "OLD", label: "Old" }, priced("STARTER")]);
      return ok({});
    });
    const data = await fetchHomeData("http://api", fake as unknown as typeof fetch);
    expect(data.resortPlans.map((p) => p.name)).toEqual(["STARTER"]);
  });

  it("is dropped when its schedule list is there but empty", async () => {
    const fake = vi.fn(async (url: string) => {
      if (url.includes("/cms/plans")) return ok([{ name: "FREE", label: "Free", schedules: [] }]);
      return ok({});
    });
    const data = await fetchHomeData("http://api", fake as unknown as typeof fetch);
    expect(data.resortPlans).toEqual([]);
  });

  it("is dropped when a rung has no period the calendar knows", async () => {
    const bad = { ...priced("ODD"), schedules: [{ id: 1, label: "Odd", openingFee: 1, perMonth: 1, savingPerMonth: 0, savingPct: 0, phases: [{ seq: 1, count: 1, unit: "FORTNIGHT", price: 1, repeats: null }] }] };
    const fake = vi.fn(async (url: string) => {
      if (url.includes("/cms/plans")) return ok([bad]);
      return ok({});
    });
    const data = await fetchHomeData("http://api", fake as unknown as typeof fetch);
    expect(data.resortPlans).toEqual([]);
  });

  it("keeps a plan that does have prices, untouched", async () => {
    const fake = vi.fn(async (url: string) => {
      if (url.includes("/cms/plans")) return ok([priced("STARTER")]);
      return ok({});
    });
    const data = await fetchHomeData("http://api", fake as unknown as typeof fetch);
    expect(data.resortPlans[0]!.schedules[0]!.phases[0]!.price).toBe(2500);
  });
});

/** A plan as `/cms/plans` actually sends one. */
function priced(name: string) {
  return {
    name,
    label: name,
    schedules: [
      {
        id: 1,
        label: "Monthly",
        openingFee: 2500,
        perMonth: 2500,
        savingPerMonth: 0,
        savingPct: 0,
        phases: [{ seq: 1, count: 1, unit: "MONTH", price: 2500, repeats: null }],
      },
    ],
    maxRooms: 10,
    maxResorts: 1,
    maxStaff: 1,
    trialDays: 14,
    blurb: null,
    highlight: false,
    features: [],
  };
}
