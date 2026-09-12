/**
 * A resort cannot hand out an agency's permissions.
 *
 * Settings → Permissions, where a resort owner builds roles for their own
 * staff, listed a group called **Agent portal**: the agency wallet, the
 * agency's payroll, its staff, its expenses. None of that belongs to a resort.
 * An agency is a separate business with its own owner, who sets its roles in
 * `/agent/team`.
 *
 * Ticking one did nothing, which is the quiet part. Every agency endpoint goes
 * through `AgencyContextService.of()`, which refuses anyone whose role is not
 * AGENT and then reads permissions from the user's *agency* role — so a resort
 * role holding `agent.book` grants exactly nothing.
 *
 * Nothing is therefore a security hole here; the defect is the promise. A
 * resort owner who unticks "Book for guests" to stop an agency selling their
 * rooms has flipped a switch wired to nothing, and the agency keeps selling.
 * The fix is to stop offering the switch, and to stop storing the key if one
 * arrives anyway — a checkbox removed from a form is still reachable by
 * anybody willing to post the body themselves.
 */
import { describe, expect, it } from "vitest";
import { AGENT_PERMISSIONS, ALL_PERMISSIONS, RESORT_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "@rh/shared";
import { validPermissions } from "../src/common/permissions";

describe("the two vocabularies", () => {
  it("share exactly one key, and it is the one both audiences own", () => {
    /**
     * `marketing.send` is deliberately in both: a resort and an agency each buy
     * their own email credits and send their own campaigns, and `/mailbox` is
     * in the sidebar for both. It is the only such key, and this pins that —
     * a second one appearing means somebody has blurred the line again.
     */
    const shared = RESORT_PERMISSIONS.filter((k) => (AGENT_PERMISSIONS as readonly string[]).includes(k));
    expect(shared).toEqual(["marketing.send"]);
  });

  it("carries no agency key into the resort list", () => {
    expect(RESORT_PERMISSIONS.filter((k) => k.startsWith("agent."))).toEqual([]);
    expect(RESORT_PERMISSIONS).toContain("bookings.create");
  });

  it("together account for every permission there is", () => {
    // a key in neither list is offered by no editor and can be granted by nobody
    expect([...new Set([...RESORT_PERMISSIONS, ...AGENT_PERMISSIONS])].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });
});

describe("saving a resort role", () => {
  it("drops an agency permission that arrives in the body", () => {
    expect(validPermissions(["bookings.view", "agent.wallet.view", "payments.view"])).toEqual([
      "bookings.view",
      "payments.view",
    ]);
  });

  it("still drops a key that is not a permission at all", () => {
    expect(validPermissions(["bookings.view", "not.a.key", 7, null])).toEqual(["bookings.view"]);
  });

  it("keeps every resort permission it is given", () => {
    expect(validPermissions([...RESORT_PERMISSIONS])).toEqual([...RESORT_PERMISSIONS]);
  });

  it("accepts the agency vocabulary when that is what is being saved", () => {
    // `/agent/roles` stores the other half, and must not have its keys stripped
    expect(validPermissions([...AGENT_PERMISSIONS], "AGENCY")).toEqual([...AGENT_PERMISSIONS]);
    // and refuses a resort key on an agency role, which would be the escalation
    // the AGENT_PERMISSIONS comment warns about: "an agency role that could
    // grant payroll.manage would be a privilege escalation dressed as a feature"
    expect(validPermissions(["payroll.manage", "agent.book"], "AGENCY")).toEqual(["agent.book"]);
  });
});

describe("the seeded resort roles", () => {
  it("do not start an Administrator holding the agency's keys", () => {
    /**
     * `Administrator` is seeded with every permission, and "every" included the
     * agency's. It is computed as `["*"]` at read time so the stored list is
     * inert today — but it is what a new resort's role row literally contains,
     * and the next reader of that row has no reason to distrust it.
     */
    // the two agency-side defaults: `Agency owner` is the agency's Administrator
    // and `Agent` is the legacy fixed role an AGENT user carries. Both hold
    // agency keys because that is what they are for
    const agencySide = new Set(["Agency owner", "Agent"]);

    for (const [role, keys] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      if (agencySide.has(role)) continue;
      // `agent.` rather than "is in AGENT_PERMISSIONS": `marketing.send` is in
      // both vocabularies on purpose and belongs on a resort Administrator
      const agencyKeys = keys.filter((k) => k.startsWith("agent."));
      expect({ role, agencyKeys }).toEqual({ role, agencyKeys: [] });
    }
  });
});
