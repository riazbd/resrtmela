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
import { consoleGate } from "../src/lib/console-access";

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
