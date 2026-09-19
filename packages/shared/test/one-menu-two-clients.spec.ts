/**
 * One list of destinations, for the desk and for the phone (2026-09-20).
 *
 * `navVisible` moved here on 2026-09-13 so that both clients would decide
 * visibility the same way. The list it decides *over* stayed in the console's
 * layout — which means the rule is shared and the thing it runs on is not,
 * and the app would have had to keep a second copy of thirty entries with
 * their permissions and their plan features written out again.
 *
 * That copy would be wrong within a month, and wrong in the worst direction:
 * a link the phone shows and the server refuses, or a screen the resort is
 * paying for that the phone never offers. So the list is data, here, and each
 * client supplies only what is genuinely its own — an icon, and a way of
 * drawing it.
 */
import { describe, expect, it } from "vitest";
import { ACCOUNT_HREF, CONSOLE_NAV, navVisible, type NavDestination } from "../src/index";

const href = (h: string): NavDestination =>
  CONSOLE_NAV.find((e) => e.href === h) ?? (() => { throw new Error(`no nav entry for ${h}`); })();

describe("the list itself", () => {
  it("has every destination the console offers", () => {
    // the count is asserted so that adding a screen to one client and not
    // the other shows up here rather than as a missing tab on a phone
    expect(CONSOLE_NAV.length).toBe(29);
  });

  it("gives every entry somewhere to go and something to read", () => {
    for (const entry of CONSOLE_NAV) {
      expect(entry.href.startsWith("/")).toBe(true);
      // one or the other: a key for the strings that are translated, plain
      // text for the ones that are not
      expect(Boolean(entry.label) || Boolean(entry.labelKey)).toBe(true);
    }
  });

  /**
   * Changing your own password is not filtered by role, permission or plan —
   * it belongs to whoever is signed in. The console keeps it in the
   * sidebar's footer for that reason, and this asserts the list has not
   * quietly acquired it.
   */
  it("leaves out the one destination that is nobody's to grant", () => {
    expect(CONSOLE_NAV.some((e) => e.href === ACCOUNT_HREF)).toBe(false);
  });

  it("names no destination twice", () => {
    const seen = CONSOLE_NAV.map((e) => e.href);
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe("what each entry carries", () => {
  it("keeps the permission that decides it", () => {
    expect(href("/bookings").perm).toBe("bookings.view");
    expect(href("/settings").perm).toBe("settings.manage");
  });

  it("keeps the plan feature, where a plan is what sells the screen", () => {
    expect(href("/fb").feature).toBe("restaurant");
    expect(href("/payroll").feature).toBe("payroll");
    // sold on the agency's own plan since 2026-09-17
    expect(href("/agent/website").feature).toBe("agency_website");
    expect(href("/agent/api").feature).toBe("agency_api");
  });

  it("keeps the audience, for the two groups a permission cannot describe", () => {
    expect(href("/platform").roles).toEqual(["SUPER"]);
    expect(href("/agent/discover").roles).toEqual(["AGENT"]);
  });
});

/**
 * The point of sharing the list: the same question, asked of the same rows,
 * gives the same answer on both clients. These are not re-tests of
 * `navVisible` — its own spec covers the rule — they are proof that the rule
 * and the rows fit together.
 */
describe("the rule over the list", () => {
  const desk = {
    role: "RESORT_ADMIN",
    can: (p: string) => p !== "settings.manage",
    features: ["restaurant"],
  };

  it("hides a screen whose permission this person lacks", () => {
    expect(navVisible(href("/settings"), desk)).toBe(false);
    expect(navVisible(href("/bookings"), desk)).toBe(true);
  });

  it("hides a screen the resort's plan does not include", () => {
    expect(navVisible(href("/fb"), desk)).toBe(true);
    expect(navVisible(href("/payroll"), desk)).toBe(false);
  });

  /**
   * An agency's permission set is its own — `agent.book`, `agent.wallet.view`
   * and so on — so a resort's screens fall away because the permission is
   * absent, not because the role is checked. Written with a real set rather
   * than `can: () => true`, which is not a person who exists and made this
   * test assert the wrong reason.
   */
  it("shows an agent their own screens and none of a resort's", () => {
    const granted = new Set(["agent.book", "agent.website.manage", "agent.wallet.view"]);
    const agent = {
      role: "AGENT",
      can: (p: string) => granted.has(p),
      features: ["agency_website", "agency_api"],
    };
    expect(navVisible(href("/agent/discover"), agent)).toBe(true);
    expect(navVisible(href("/agent/search"), agent)).toBe(true);
    expect(navVisible(href("/agent/website"), agent)).toBe(true);
    // not granted to this one, though another agency user might have it
    expect(navVisible(href("/agent/payroll"), agent)).toBe(false);
    // a resort's screens: refused by the permission, which the agency does
    // not have, rather than by the role
    expect(navVisible(href("/daysheet"), agent)).toBe(false);
    expect(navVisible(href("/bookings"), agent)).toBe(false);
    expect(navVisible(href("/platform"), agent)).toBe(false);
  });

  /**
   * The platform owner's sidebar is the platform's and only the platform's.
   * SUPER_ADMIN resolves to `["*"]`, so without this every resort screen
   * appeared in their menu — and a *particular* resort's, whichever one
   * their account happened to be linked to.
   */
  it("shows the platform owner the platform, and nothing of a resort", () => {
    const owner = { role: "SUPER_ADMIN", can: () => true, features: [] };
    expect(navVisible(href("/platform"), owner)).toBe(true);
    for (const entry of CONSOLE_NAV.filter((e) => e.href !== "/platform")) {
      expect(navVisible(entry, owner)).toBe(false);
    }
  });
});
