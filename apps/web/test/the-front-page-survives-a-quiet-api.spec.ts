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
      if (url.includes("audience=AGENCY")) return ok([{ name: "AGENCY_BASIC" }]);
      if (url.includes("/cms/plans")) return ok([{ name: "STARTER" }]);
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
      if (url.includes("/cms/plans")) return ok([{ name: "STARTER" }]);
      return ok({});
    });
    const data = await fetchHomeData("http://api", fake as unknown as typeof fetch);
    expect(data.resortPlans[0]!.name).toBe("STARTER");
    expect(data.agencyPlans).toEqual([]);
  });
});
