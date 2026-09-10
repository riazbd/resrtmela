/**
 * Who gets past the console's front door.
 *
 * The layout asked one question — `loading || !me || !activeResort` — and
 * showed "Loading…" for every no. Two people were caught by the third clause
 * and neither of them was loading.
 *
 * The platform owner has no resort. That is the whole point of the role: they
 * sell to resorts, they do not run one. So a SUPER_ADMIN account that was not
 * also linked to somebody's resort sat on "Loading…" for ever and could never
 * reach Platform → Plans, which is the one screen that only they can use. It
 * was found by opening the page.
 *
 * The other is a staff account whose resort link was removed. They are not
 * loading either; they are locked out, and an unending spinner is the least
 * useful way to say so.
 */
import { describe, expect, it } from "vitest";
import { consoleGate, navVisible, missingFeature } from "../src/lib/console-access";

const resort = { id: 1, name: "Sky Eco" };

describe("the console's front door", () => {
  it("waits while the session is still being fetched", () => {
    expect(consoleGate({ loading: true, me: null, activeResort: null })).toBe("loading");
  });

  it("sends someone with no session to the login page", () => {
    expect(consoleGate({ loading: false, me: null, activeResort: null })).toBe("login");
  });

  it("sends a guest to the login page — the console is not for them", () => {
    expect(
      consoleGate({ loading: false, me: { role: "GUEST" }, activeResort: null }),
    ).toBe("login");
  });

  it("lets staff in when they have a resort to work in", () => {
    expect(
      consoleGate({ loading: false, me: { role: "MANAGER" }, activeResort: resort }),
    ).toBe("ready");
  });

  it("lets the platform owner in without one, because they never have one", () => {
    expect(
      consoleGate({ loading: false, me: { role: "SUPER_ADMIN" }, activeResort: null }),
    ).toBe("ready");
  });

  it("tells staff with no resort what is wrong instead of spinning", () => {
    expect(
      consoleGate({ loading: false, me: { role: "MANAGER" }, activeResort: null }),
    ).toBe("no-resort");
  });

  it("lets an agent in — their work is across resorts, not inside one", () => {
    expect(
      consoleGate({ loading: false, me: { role: "AGENT" }, activeResort: null }),
    ).toBe("ready");
  });
});

/**
 * Which links a person sees.
 *
 * Permissions decided this on their own, so a resort on a plan without the
 * restaurant still had "Restaurant" in the sidebar and met a 403 on arriving.
 * A menu that leads to a wall is the same fault the matrix had in the other
 * direction: a hidden link is not access control, and a shown link is not
 * permission either.
 */
describe("the links in the sidebar", () => {
  const everything = ["restaurant", "payroll", "imports", "bulk_email"];
  const staff = (perms: string[], features: string[]) => ({
    role: "MANAGER",
    can: (p: string) => perms.includes(p),
    features,
  });

  it("shows a link the person may use and the plan includes", () => {
    const entry = { roles: ["STAFF"], perm: "restaurant.view", feature: "restaurant" };

    expect(navVisible(entry, staff(["restaurant.view"], everything))).toBe(true);
  });

  it("hides one the plan does not include, however the permission reads", () => {
    const entry = { roles: ["STAFF"], perm: "restaurant.view", feature: "restaurant" };

    expect(navVisible(entry, staff(["restaurant.view"], ["payroll"]))).toBe(false);
  });

  it("still hides one the permission refuses, however the plan reads", () => {
    const entry = { roles: ["STAFF"], perm: "restaurant.view", feature: "restaurant" };

    expect(navVisible(entry, staff([], everything))).toBe(false);
  });

  it("leaves links with no feature alone — most of the console is in every plan", () => {
    const entry = { roles: ["STAFF"], perm: "bookings.view" };

    expect(navVisible(entry, staff(["bookings.view"], []))).toBe(true);
  });

  it("shows the platform link only to the platform", () => {
    const entry = { roles: ["SUPER"] };

    expect(navVisible(entry, { role: "SUPER_ADMIN", can: () => false, features: [] })).toBe(true);
    expect(navVisible(entry, staff(["settings.manage"], everything))).toBe(false);
  });

  it("does not lock an agent out of their own screens — an agency has no resort plan", () => {
    /**
     * `features` is the active resort's plan, and an agent's screens are the
     * agency's, not a resort's. Reading a resort's plan to decide whether an
     * agency may see its own wallet would be the wrong question entirely.
     */
    const entry = { roles: ["AGENT"], perm: "agent.wallet.view" };
    const agent = { role: "AGENT", can: (p: string) => p === "agent.wallet.view", features: [] };

    expect(navVisible(entry, agent)).toBe(true);
  });
});

describe("a link shared between a resort and its agents", () => {
  /** Bulk Email is the only one. Its agent copy is the agency's own list. */
  const mailbox = { roles: ["MGMT", "AGENT"], perm: "marketing.send", feature: "bulk_email" };

  it("is hidden from resort staff when the plan leaves bulk email out", () => {
    expect(
      navVisible(mailbox, { role: "MANAGER", can: () => true, features: [] }),
    ).toBe(false);
  });

  it("stays for an agent, whose guest list is not the resort's to sell back", () => {
    expect(navVisible(mailbox, { role: "AGENT", can: () => true, features: [] })).toBe(true);
  });
});

/**
 * Hiding the link is not the whole job.
 *
 * A URL typed by hand, or a bookmark from the month before the plan changed,
 * still opens the screen. The API refuses the writes, so nothing breaks — but
 * the page offers a "New bill" button that answers 403 and says nothing about
 * why. The layout knows which screen it is showing and what the plan includes,
 * so it can say so once instead of five pages each saying it themselves.
 */
describe("opening a screen the plan does not include", () => {
  const nav = [
    { href: "/fb", roles: ["STAFF"], perm: "restaurant.view", feature: "restaurant" },
    { href: "/bookings", roles: ["*"], perm: "bookings.view" },
  ];

  it("names the feature that is missing", () => {
    expect(missingFeature("/fb", nav, ["payroll"])).toBe("restaurant");
  });

  it("says nothing when the plan includes it", () => {
    expect(missingFeature("/fb", nav, ["restaurant"])).toBeNull();
  });

  it("says nothing for a screen that is in every plan", () => {
    expect(missingFeature("/bookings", nav, [])).toBeNull();
  });

  it("matches the screen's own sub-pages, not just its index", () => {
    expect(missingFeature("/fb/123", nav, [])).toBe("restaurant");
  });

  it("does not match a different screen that starts with the same letters", () => {
    expect(missingFeature("/fbx", nav, [])).toBeNull();
  });

  it("says nothing for a screen nothing in the menu claims", () => {
    expect(missingFeature("/somewhere-else", nav, [])).toBeNull();
  });
});
