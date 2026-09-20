/**
 * The console header knows who signed in (2026-09-21).
 *
 * The phone's More menu was headed "RESORT / Sky Eco Resort" to an
 * agency, and was fixed this morning. The reader asked whether the desk
 * had it too. It did:
 *
 *     Resort  [ Sky Eco Resort ▾ ]
 *
 * sitting directly above "Discover resorts", listing all four resorts
 * the agency is approved to sell as if they were places it works. Same
 * cause on both clients, and the cause is visible in the condition:
 * `activeResort && role !== "SUPER_ADMIN"`. Somebody thought about the
 * platform owner having no resort and did not think about the agency,
 * although `consoleGate` calls both of them resortless in the same line
 * of `@rh/shared`.
 *
 * For an agent the switcher was also inert: their screens are
 * agency-wide — Discover, the search, the calendar, the wallet — and
 * `navVisible` deliberately never reads a resort's plan for them. So it
 * was a control that changed nothing, under a word that was wrong.
 *
 * The test-account strip had the same shape of error. It reads
 * `activeResort.tenant.demo` — the *resort's* flag — so the demo agency
 * carried no warning at all while somebody clicked around in it, and a
 * real agency whose first sellable resort happened to be a demo one
 * would have been told its own console was a test account, naming
 * somebody else's business. An agency's own `demo` was there to read:
 * `account` is a Tenant of kind AGENCY and `Tenant.demo` has existed as
 * long as the flag has. `/auth/me` simply never asked for it.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { consoleGate } from "@rh/shared";

const layout = fs.readFileSync(
  path.resolve(process.cwd(), "src/app/(app)/layout.tsx"),
  "utf8",
);

const code = layout.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the resort switcher", () => {
  it("is not offered to somebody with no resort of their own", () => {
    // the hand-written half-list that caused this
    expect(code).not.toMatch(/role !== "SUPER_ADMIN"/);
  });

  it("asks the shared rule which roles those are", () => {
    expect(code).toMatch(/RESORTLESS|isResortless/);
  });

  /**
   * The rule itself, so this rests on behaviour and not on a spelling.
   * `consoleGate` lets both through with no resort, which is the same
   * statement the switcher now makes.
   */
  it("agrees with consoleGate about who has no resort", () => {
    for (const role of ["SUPER_ADMIN", "AGENT"]) {
      expect(consoleGate({ loading: false, me: { role }, activeResort: null })).toBe("ready");
    }
    expect(consoleGate({ loading: false, me: { role: "RESORT_ADMIN" }, activeResort: null })).toBe(
      "no-resort",
    );
  });
});

describe("the test-account strip", () => {
  it("reads the agency's own flag, not a resort it happens to sell", () => {
    expect(code).toMatch(/me\??\.account\??\.demo/);
  });

  it("still names the resort for resort staff", () => {
    expect(code).toMatch(/activeResort\?\.tenant\?\.demo/);
  });
});
