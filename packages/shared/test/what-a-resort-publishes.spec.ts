/**
 * The vocabulary of a published site.
 *
 * Two small pure rules that both faces of the published view depend on, kept
 * here because the site renders them and the API will serve them, and a rule
 * with two implementations is a rule with two answers.
 */
import { describe, expect, it } from "vitest";
import { SITE_TEMPLATES, isSiteTemplate, roomTypeKeys, siteSlug } from "../src/site";

describe("the templates a resort may choose from", () => {
  it("is a closed list the code declares, like a plan feature", () => {
    expect(SITE_TEMPLATES.length).toBeGreaterThanOrEqual(2);
    for (const t of SITE_TEMPLATES) {
      expect(t.key).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.blurb.length).toBeGreaterThan(0);
    }
  });

  it("has no two templates under one key", () => {
    const keys = SITE_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  /**
   * A name the code has never heard of renders nothing, so it must never reach
   * the column. This is the same rule `isPlanFeature` enforces, for the same
   * reason: a value the database is allowed to hold and the code cannot use is
   * a blank screen nobody can explain.
   */
  it("refuses a template nobody wrote", () => {
    expect(isSiteTemplate(SITE_TEMPLATES[0]!.key)).toBe(true);
    expect(isSiteTemplate("something-from-a-blog-post")).toBe(false);
    expect(isSiteTemplate("")).toBe(false);
    expect(isSiteTemplate(null)).toBe(false);
    expect(isSiteTemplate(7)).toBe(false);
  });
});

describe("the address a name turns into", () => {
  it("lowercases, joins on dashes, and drops the punctuation", () => {
    expect(siteSlug("Sky Eco Resort")).toBe("sky-eco-resort");
    expect(siteSlug("  Cox's Bay — Beach Resort!  ")).toBe("cox-s-bay-beach-resort");
  });

  it("never begins or ends with a dash, however the name was typed", () => {
    expect(siteSlug("--- Hilltop ---")).toBe("hilltop");
  });

  it("gives a name with nothing usable in it something to be", () => {
    expect(siteSlug("!!!")).toBe("resort");
    expect(siteSlug("")).toBe("resort");
    // a Bangla name has no ASCII to keep, and must still produce an address
    expect(siteSlug("স্কাই ইকো")).toBe("resort");
  });

  it("does not run past the column", () => {
    expect(siteSlug("a".repeat(200)).length).toBeLessThanOrEqual(80);
  });
});

describe("the key a room type is addressed by on a page", () => {
  /**
   * Positional, so the caller can zip the keys back onto its own rows. The
   * page uses them for anchors and for matching an availability count to the
   * room type it belongs to — which is the whole reason a room type needs a
   * public handle that is not its database id.
   */
  it("derives one key per name, in order", () => {
    expect(roomTypeKeys(["Deluxe", "Family Suite"])).toEqual(["deluxe", "family-suite"]);
  });

  it("keeps two room types with the same name apart", () => {
    expect(roomTypeKeys(["Deluxe", "Deluxe", "Deluxe"])).toEqual(["deluxe", "deluxe-2", "deluxe-3"]);
  });

  it("does not collide a deduped key with a real one", () => {
    // the second "Deluxe" wants "deluxe-2", which is already taken
    expect(roomTypeKeys(["Deluxe", "Deluxe 2", "Deluxe"])).toEqual(["deluxe", "deluxe-2", "deluxe-3"]);
  });

  it("gives an unnameable room type something to be, and still keeps them apart", () => {
    expect(roomTypeKeys(["★", "★"])).toEqual(["room", "room-2"]);
  });

  it("has nothing to say about an empty resort", () => {
    expect(roomTypeKeys([])).toEqual([]);
  });
});
