/**
 * What opens inside the app, and what leaves it.
 *
 * A WebView that follows every link becomes a browser: tap a guest's phone
 * number and you are stuck on a dialer page with no way back; tap an outgoing
 * link and the app silently becomes a different website, still wearing our
 * icon. A WebView that follows nothing is a screenshot.
 *
 * The rule is ownership: our console navigates in place, everything else is
 * handed to the phone, which already knows what a `tel:` is for.
 */
import { describe, expect, it } from "vitest";
import { routeFor } from "../src/console/url-policy";

const CONSOLE = "https://resortmela.rootcodebd.com";

describe("routeFor", () => {
  it("keeps the console inside the app", () => {
    expect(routeFor("https://resortmela.rootcodebd.com/daysheet", CONSOLE)).toBe("inside");
    expect(routeFor("https://resortmela.rootcodebd.com/agent/wallet?from=2026-09-01", CONSOLE)).toBe("inside");
  });

  it("sends other sites to the phone's browser", () => {
    expect(routeFor("https://www.google.com/maps", CONSOLE)).toBe("outside");
    expect(routeFor("https://facebook.com/resortmela", CONSOLE)).toBe("outside");
  });

  it("hands phone, mail and chat links to the apps that own them", () => {
    // a front desk taps a guest's number to call them; that is the phone's job
    expect(routeFor("tel:+8801712345678", CONSOLE)).toBe("outside");
    expect(routeFor("mailto:guest@example.com", CONSOLE)).toBe("outside");
    expect(routeFor("whatsapp://send?phone=8801712345678", CONSOLE)).toBe("outside");
    expect(routeFor("intent://scan#Intent;scheme=zxing;end", CONSOLE)).toBe("outside");
  });

  it("is not fooled by a host that merely ends with ours", () => {
    // evil-resortmela.rootcodebd.com.attacker.net must not read as ours
    expect(routeFor("https://resortmela.rootcodebd.com.attacker.net/login", CONSOLE)).toBe("outside");
    expect(routeFor("https://notresortmela.rootcodebd.com/login", CONSOLE)).toBe("outside");
  });

  it("treats a plain-http twin as somewhere else", () => {
    // the console is served over TLS; an http:// copy of the same host is
    // either a downgrade or an impostor, and is never opened in place
    expect(routeFor("http://resortmela.rootcodebd.com/login", CONSOLE)).toBe("outside");
  });

  it("allows the blank document the WebView uses between pages", () => {
    expect(routeFor("about:blank", CONSOLE)).toBe("inside");
  });

  it("refuses anything it cannot parse", () => {
    expect(routeFor("", CONSOLE)).toBe("blocked");
    expect(routeFor("javascript:alert(1)", CONSOLE)).toBe("blocked");
  });
});

/**
 * The platform moved from `resortmela.rootcodebd.com` to `resortmela.com`
 * (2026-09-19). An installed app knows only the address it was built with, so
 * the first redirect to the new one would read as "somewhere else" and hand the
 * console to the phone's browser — the app, in effect, uninstalled.
 *
 * So ownership is a list, not a single origin. The old address stays on it for
 * as long as an old build might still be on somebody's phone.
 */
describe("a console that has more than one address", () => {
  const BOTH = ["https://resortmela.com", "https://resortmela.rootcodebd.com"];

  it("keeps every address on the list inside the app", () => {
    expect(routeFor("https://resortmela.com/daysheet", BOTH)).toBe("inside");
    expect(routeFor("https://resortmela.rootcodebd.com/daysheet", BOTH)).toBe("inside");
  });

  it("is still nobody else's", () => {
    expect(routeFor("https://resortmela.com.attacker.net/login", BOTH)).toBe("outside");
    expect(routeFor("http://resortmela.com/login", BOTH)).toBe("outside");
    expect(routeFor("https://www.google.com", BOTH)).toBe("outside");
  });

  it("still takes a single address, which is how every caller wrote it", () => {
    expect(routeFor("https://resortmela.com/x", "https://resortmela.com")).toBe("inside");
  });

  it("owns nothing when given nothing", () => {
    expect(routeFor("https://resortmela.com/x", [])).toBe("outside");
  });
});
