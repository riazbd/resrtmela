/**
 * What a resort's page does when the answer is not what it expected.
 *
 * The front page learned this expensively: a guard that asserted a type while
 * checking nothing let a row through, the render threw, and the whole page went
 * down on a deploy. This page would be worse — it is the front of somebody
 * else's business, on their own domain, and they would hear about it before we
 * did.
 *
 * So every failure is the same failure: `null`, which the page turns into a
 * 404. Never a throw, never a half-drawn page.
 */
import { describe, expect, it, vi } from "vitest";
import { fetchPublishedResort } from "../src/app/r/[slug]/site-data";

const GOOD = {
  slug: "sky-eco-resort",
  name: "Sky Eco Resort",
  location: "Srimangal",
  photos: [],
  roomTypes: [{ key: "deluxe", name: "Deluxe", sleeps: { adults: 2, children: 0 }, amenities: [], photos: [], priceFrom: 2200 }],
  template: "verandah",
};

const replying = (body: unknown, ok = true) =>
  vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response);

describe("a page that can be drawn", () => {
  it("comes back whole", async () => {
    const page = await fetchPublishedResort("http://api", "sky-eco-resort", replying(GOOD));
    expect(page).toMatchObject({ name: "Sky Eco Resort", template: "verandah" });
  });

  it("asks the API for the slug it was given, encoded", async () => {
    const fetchImpl = replying(GOOD);
    await fetchPublishedResort("http://api", "a b", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith("http://api/site/a%20b", expect.anything());
  });

  it("keeps rendering when the template was retired since the row was written", async () => {
    const page = await fetchPublishedResort("http://api", "x", replying({ ...GOOD, template: "gone" }));
    expect(page!.template).toBe("sanctuary");
  });
});

describe("a page that cannot", () => {
  it("is nothing when the API refuses", async () => {
    expect(await fetchPublishedResort("http://api", "x", replying({}, false))).toBeNull();
  });

  it("is nothing when the API is not there at all", async () => {
    const dead = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(await fetchPublishedResort("http://api", "x", dead as never)).toBeNull();
  });

  it("is nothing when the body is not a resort", async () => {
    for (const body of [null, "a string", 42, [], {}, { slug: "x" }]) {
      expect(await fetchPublishedResort("http://api", "x", replying(body))).toBeNull();
    }
  });

  /**
   * The exact shape that took the front page down: the right keys, and a list
   * whose rows are not what the page iterates.
   */
  it("is nothing when a room type is not a room type", async () => {
    const bad = { ...GOOD, roomTypes: [{ name: "Deluxe" }] };
    expect(await fetchPublishedResort("http://api", "x", replying(bad))).toBeNull();
  });

  it("is nothing when the photographs are not a list", async () => {
    expect(await fetchPublishedResort("http://api", "x", replying({ ...GOOD, photos: null }))).toBeNull();
  });
});
