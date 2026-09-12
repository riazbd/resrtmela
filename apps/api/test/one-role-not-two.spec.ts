/**
 * A staff member has one role, and it is the permission set.
 *
 * Settings → Users & Roles asked for two things and called both a role: a
 * fixed **Role** (Manager / Front desk / Housekeeping) and a **Permissions
 * set** (Administrator / Manager / Front Desk / anything the owner built).
 * They could disagree, and in a live console they did — somebody listed as
 * FRONT DESK was carrying the permissions of a role called Admin.
 *
 * The fixed role cannot simply be deleted: `isStaff` and `isManagement` read it
 * in fifty-seven places, and `HOUSEKEEPING` is deliberately *not* staff. So it
 * stops being something anyone chooses and becomes something computed — a
 * one-word summary of the permission set. Two values that are derived from each
 * other cannot contradict each other.
 *
 * The order below is the whole design: each rung is the least authority that
 * still deserves the name, and the first one that matches wins.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS } from "@rh/shared";
import { accountKindFor, accountKindForRole } from "../src/common/permissions";

describe("the role a permission set implies", () => {
  it("calls a set that holds everything an administrator", () => {
    expect(accountKindFor(["*"])).toBe("RESORT_ADMIN");
  });

  it("calls a set that can change the resort itself a manager", () => {
    // the kind is read off what `isManagement` unlocks in the console: Settings
    // entire, Import, the audit trail — so it is earned by the permissions
    // that govern those, and by nothing else
    expect(accountKindFor(["bookings.view", "settings.manage"])).toBe("MANAGER");
    expect(accountKindFor(["bookings.view", "users.manage"])).toBe("MANAGER");
    expect(accountKindFor(["bookings.view", "roles.manage"])).toBe("MANAGER");
    expect(accountKindFor(DEFAULT_ROLE_PERMISSIONS.Manager)).toBe("MANAGER");
  });

  it("does not promote a senior front desk to management", () => {
    /**
     * Production has five people on a role called "Admin": bookings, payments,
     * expenses, `rooms.manage`, `reports.pl`, `billing.view` — and no
     * `settings.manage`. Calling that MANAGER opens Settings for them, where
     * every write is then refused. Running the inventory is not owning the
     * resort.
     */
    const seniorDesk = [
      "bookings.view", "bookings.create", "bookings.edit", "bookings.cancel", "bookings.walkin",
      "payments.view", "payments.create", "expenses.view", "expenses.create",
      "rooms.view", "rooms.manage", "guests.view", "reports.view", "reports.pl",
      "payroll.view", "activities.manage", "auditlog.view", "billing.view", "export.run",
    ];
    expect(accountKindFor(seniorDesk)).toBe("FRONT_DESK");
  });

  it("calls a set that works the register a front desk", () => {
    expect(accountKindFor(DEFAULT_ROLE_PERMISSIONS["Front Desk"])).toBe("FRONT_DESK");
    expect(accountKindFor(["bookings.view"])).toBe("FRONT_DESK");
  });

  it("calls a set that cannot see a booking housekeeping", () => {
    /**
     * Not a leftover: `isStaff` excludes HOUSEKEEPING on purpose, so most of
     * the console answers "Staff only" to them. Somebody given a role with no
     * booking access must land here rather than becoming a front desk by
     * default, which would hand them the register.
     */
    expect(accountKindFor([])).toBe("HOUSEKEEPING");
    expect(accountKindFor(["rooms.view"])).toBe("HOUSEKEEPING");
  });

  it("is not fooled by an agency key sitting in the list", () => {
    // they cannot be saved on a resort role any more, but old rows still carry
    // them, and none of them should promote anybody
    expect(accountKindFor(["agent.staff.manage", "agent.payroll.manage"])).toBe("HOUSEKEEPING");
  });

  it("gives the same answer twice for the same set", () => {
    const set = ["bookings.view", "payments.create", "settings.manage"];
    expect(accountKindFor(set)).toBe(accountKindFor([...set].reverse()));
  });
});

describe("the two can no longer disagree", () => {
  it("because there is only one of them to choose", () => {
    /**
     * The reported state: FRONT_DESK on the account, a set called Admin on the
     * permissions. Whatever the stored enum said, the derived one now follows
     * the permissions — so the list shows what the person can actually do.
     */
    const adminish = ["*"];
    expect(accountKindFor(adminish)).toBe("RESORT_ADMIN");
    expect(accountKindFor(DEFAULT_ROLE_PERMISSIONS["Front Desk"])).toBe("FRONT_DESK");
  });
});

describe("the Administrator role, which is a definition rather than a list", () => {
  it("means administrator, whatever its stored permissions happen to say", () => {
    /**
     * `ADMIN_ROLE`'s row does not contain `*`. It is seeded with the resort
     * permission list and `resolve()` special-cases it by name, because a
     * snapshot taken the day the resort was created goes stale the moment a
     * permission is added. Deriving from that stored list alone would call the
     * owner a MANAGER — and put the contradiction straight back.
     */
    expect(
      accountKindForRole({ system: true, name: "Administrator", permissions: DEFAULT_ROLE_PERMISSIONS.Administrator }),
    ).toBe("RESORT_ADMIN");
  });

  it("does not promote a role somebody merely named Administrator", () => {
    // the same distinction `resolve()` draws: `system` as well as the name
    expect(
      accountKindForRole({ system: false, name: "Administrator", permissions: ["bookings.view"] }),
    ).toBe("FRONT_DESK");
  });

  it("falls back to the permissions for every other role", () => {
    expect(accountKindForRole({ system: true, name: "Manager", permissions: ["settings.manage"] })).toBe("MANAGER");
    expect(accountKindForRole(null)).toBe(null);
  });
});
