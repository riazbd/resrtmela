/**
 * An agency's page, fetched on the server, never throws (2026-09-17).
 *
 * The same lesson as a resort's page: a shape checked rather than asserted,
 * so one odd row is a 404 and not an error page on somebody's front door.
 */
import { describe, expect, it, vi } from "vitest";
import { fetchAgencyPage } from "../src/app/a/[slug]/agency-data";

const GOOD = {
  agency: {
    slug: "sky-trips", name: "Sky Trips", headline: null, intro: null, phone: null, email: null,
    whatsapp: "8801711000000", address: null, themeColor: null, social: { facebook: null, instagram: null }, photos: [],
  },
  resorts: [
    { slug: "sky-eco-resort", name: "Sky Eco Resort", location: "Srimangal", currency: "BDT", locale: "en-IN", checkInTime: "12:00", checkOutTime: "11:00", photos: [], roomTypes: [], bookableUntil: null },
  ],
  tours: [{ id: 1, name: "Tea trail", summary: null, days: 2, nights: 1, pax: 2, price: 9000 }],
};

const replying = (body: unknown, ok = true) =>
  vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response);

describe("an agency page that can be drawn", () => {
  it("comes back whole", async () => {
    expect(await fetchAgencyPage("http://api", "sky-trips", replying(GOOD))).toMatchObject({ agency: { name: "Sky Trips" } });
  });

  it("asks for the slug it was given, encoded", async () => {
    const fetchImpl = replying(GOOD);
    await fetchAgencyPage("http://api", "a b", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith("http://api/site/agency/a%20b", expect.anything());
  });
});

describe("an agency page that cannot", () => {
  it("is nothing when the API refuses", async () => {
    expect(await fetchAgencyPage("http://api", "x", replying({}, false))).toBeNull();
  });

  it("is nothing when the API is not there", async () => {
    const down = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(await fetchAgencyPage("http://api", "x", down as unknown as typeof fetch)).toBeNull();
  });

  it("is nothing when a tour has no price to print", async () => {
    const bad = { ...GOOD, tours: [{ id: 1, name: "Tea trail" }] };
    expect(await fetchAgencyPage("http://api", "x", replying(bad))).toBeNull();
  });
});
