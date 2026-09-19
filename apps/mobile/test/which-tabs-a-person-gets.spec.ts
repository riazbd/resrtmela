/**
 * The five tabs, and who gets which.
 *
 * A phone has room for five. The console has a sidebar with thirty entries,
 * so the app has to choose — and the choice is the design's: the four screens
 * each audience opens all day, plus More for everything else.
 *
 *   resort staff   Home  Calendar  Bookings  Rooms  More
 *   agent          Discover  Find a room  Calendar  Sales  More
 *
 * What decides visibility is `navVisible` over `CONSOLE_NAV`, both shared, so
 * a tab the phone shows is a screen the server will serve. A tab whose
 * permission somebody lacks is not rendered and the bar compacts — a
 * disabled tab is a promise the product does not keep.
 */
import { moreFor, tabsFor, type Who } from "../src/nav/tabs";

const deskWithEverything: Who = {
  role: "RESORT_ADMIN",
  can: () => true,
  features: ["restaurant", "payroll", "activities", "imports", "bulk_email"],
};

const agentWithEverything: Who = {
  role: "AGENT",
  can: () => true,
  features: ["agency_website", "agency_api"],
};

describe("resort staff", () => {
  it("get the four screens a front desk lives in", () => {
    expect(tabsFor(deskWithEverything).map((t) => t.href)).toEqual([
      "/dashboard",
      "/calendar",
      "/bookings",
      "/rooms",
    ]);
  });

  /**
   * Not a gap, and not a tab that refuses when tapped. Somebody who may see
   * bookings but not rooms gets a three-tab bar.
   */
  it("lose a tab they have no permission for, and the bar closes up", () => {
    const noRooms: Who = {
      ...deskWithEverything,
      can: (p) => p !== "rooms.view",
    };
    expect(tabsFor(noRooms).map((t) => t.href)).toEqual([
      "/dashboard",
      "/calendar",
      "/bookings",
    ]);
  });
});

describe("an agent", () => {
  it("gets the agency's own four, and none of a resort's", () => {
    expect(tabsFor(agentWithEverything).map((t) => t.href)).toEqual([
      "/agent/discover",
      "/agent/search",
      "/agent/calendar",
      "/agent/sales",
    ]);
  });

  it("keeps Discover even when the agency has granted them nothing else", () => {
    const newcomer: Who = { role: "AGENT", can: () => false, features: [] };
    // the screen where an agency asks a resort for access is behind no
    // permission, which is the whole reason a new agency can reach anything
    expect(tabsFor(newcomer).map((t) => t.href)).toEqual(["/agent/discover"]);
  });
});

describe("the platform owner", () => {
  /**
   * Native platform administration is out of scope by the owner's own
   * choice: it is their tool, it is 2,092 lines, and it stays on the desk.
   * So there are no tabs — not an empty bar, none.
   */
  it("gets no tabs at all, because that console is not on the phone", () => {
    const owner: Who = { role: "SUPER_ADMIN", can: () => true, features: [] };
    expect(tabsFor(owner)).toEqual([]);
  });
});

describe("More", () => {
  it("holds every permitted destination that is not already a tab", () => {
    const more = moreFor(deskWithEverything).map((d) => d.href);
    for (const tab of tabsFor(deskWithEverything)) {
      expect(more).not.toContain(tab.href);
    }
    // a sample of what a fully-permitted resort admin should still reach
    for (const href of ["/daysheet", "/payments", "/guests", "/fb", "/reports", "/settings"]) {
      expect(more).toContain(href);
    }
  });

  it("leaves out what the permission or the plan refuses", () => {
    const noRestaurant: Who = {
      role: "RESORT_ADMIN",
      can: () => true,
      features: [], // a plan with none of the sold features
    };
    const more = moreFor(noRestaurant).map((d) => d.href);
    expect(more).not.toContain("/fb");
    expect(more).not.toContain("/payroll");
    expect(more).toContain("/daysheet");
  });

  it("keeps the console's order, so the two read the same way", () => {
    const more = moreFor(deskWithEverything).map((d) => d.href);
    expect(more.indexOf("/daysheet")).toBeLessThan(more.indexOf("/payments"));
    expect(more.indexOf("/payments")).toBeLessThan(more.indexOf("/reports"));
  });

  /**
   * Changing your own password belongs to whoever is signed in, whatever
   * they are, so it is not in `CONSOLE_NAV` and not filtered. The console
   * puts it in the sidebar's footer; More is the same place on a phone.
   */
  it("does not carry the account link, which the screen adds itself", () => {
    expect(moreFor(deskWithEverything).map((d) => d.href)).not.toContain("/account");
  });
});
