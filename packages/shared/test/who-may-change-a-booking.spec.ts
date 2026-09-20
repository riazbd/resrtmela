/**
 * Who may change a booking, and what actually changed (2026-09-20).
 *
 * `PATCH /bookings/:id` has two rules neither client knew, both written
 * into `bookings.service.ts` and both enforced with a 409 the clerk meets
 * only after filling the form in:
 *
 *   - **an agent and a front desk may edit only before the guest arrives.**
 *     A manager may edit afterwards; an owner may. The console offered
 *     Edit on a checked-in booking to everybody who had `bookings.edit`,
 *     so a front-desk clerk could open the form, change the dates, press
 *     Save and be told "Front desk can edit only Pending/Confirmed";
 *   - **an agent may not touch the discount at all.** The console does not
 *     draw that box for an agent, which is right by accident: nothing said
 *     so, and the phone was about to draw its own form.
 *
 * The second half is the patch itself. Only what moved is sent, and two
 * of the comparisons are easy to get wrong: a percentage discount keeps
 * `discountValue` beside the money it came to, and the API refuses a
 * change of kind that does not say what the new discount is.
 */
import { describe, expect, it } from "vitest";
import { bookingChanges, canEditStay } from "../src/index";

describe("who may change a booking", () => {
  const before = ["PENDING", "CONFIRMED"] as const;
  const after = ["CHECKED_IN", "CHECKED_OUT", "CANCELLED", "NO_SHOW"] as const;

  it("lets a manager change one at any point in the stay", () => {
    for (const state of [...before, ...after]) {
      expect(canEditStay({ role: "MANAGER", state }).allowed).toBe(true);
    }
  });

  it("lets an owner and an administrator do the same", () => {
    expect(canEditStay({ role: "RESORT_ADMIN", state: "CHECKED_IN" }).allowed).toBe(true);
    expect(canEditStay({ role: "SUPER_ADMIN", state: "CHECKED_OUT" }).allowed).toBe(true);
  });

  it("lets a front desk change one before the guest arrives", () => {
    for (const state of before) {
      expect(canEditStay({ role: "FRONT_DESK", state }).allowed).toBe(true);
    }
  });

  /**
   * The case the console got wrong. Offering the form and refusing the
   * save is worse than not offering it: the clerk has done the work and
   * has no idea which part of it was the problem.
   */
  it("stops a front desk once the guest is in the room", () => {
    const verdict = canEditStay({ role: "FRONT_DESK", state: "CHECKED_IN" });
    expect(verdict.allowed).toBe(false);
    expect(verdict.why).toMatch(/before the guest arrives|manager/i);
  });

  it("stops an agent once the guest is in the room", () => {
    expect(canEditStay({ role: "AGENT", state: "CHECKED_IN" }).allowed).toBe(false);
    expect(canEditStay({ role: "AGENT", state: "CONFIRMED" }).allowed).toBe(true);
  });

  it("never lets an agent change the discount", () => {
    expect(canEditStay({ role: "AGENT", state: "CONFIRMED" }).mayChangeDiscount).toBe(false);
    expect(canEditStay({ role: "FRONT_DESK", state: "CONFIRMED" }).mayChangeDiscount).toBe(true);
    expect(canEditStay({ role: "MANAGER", state: "CHECKED_IN" }).mayChangeDiscount).toBe(true);
  });

  /** A role this list has never heard of gets the careful answer. */
  it("refuses a role it does not know rather than guessing", () => {
    expect(canEditStay({ role: "HOUSEKEEPING", state: "CONFIRMED" }).allowed).toBe(false);
  });
});

const stay = {
  checkIn: "2026-09-22T00:00:00.000Z",
  checkOut: "2026-09-24T00:00:00.000Z",
  adults: 2,
  children: 0,
  discount: 0,
  discountKind: "FLAT" as const,
  discountValue: 0,
  remarks: null,
};

const same = {
  checkIn: "2026-09-22",
  checkOut: "2026-09-24",
  adults: 2,
  children: 0,
  discount: 0,
  discountKind: "FLAT" as const,
  remarks: "",
};

describe("what actually changed", () => {
  it("sends nothing when nothing moved", () => {
    expect(bookingChanges(stay, same)).toEqual({});
  });

  /**
   * The API sends dates as full ISO and takes them as civil dates. A
   * comparison that forgets is a patch that moves the dates on every save
   * — and moving the dates re-prices every night of the stay.
   */
  it("does not think a date moved because the API sent a time with it", () => {
    expect(bookingChanges(stay, { ...same, checkIn: "2026-09-22" })).toEqual({});
  });

  it("sends a date that did move", () => {
    expect(bookingChanges(stay, { ...same, checkOut: "2026-09-25" })).toEqual({
      checkOut: "2026-09-25",
    });
  });

  it("sends a head count that moved, and not the one that did not", () => {
    expect(bookingChanges(stay, { ...same, adults: 3 })).toEqual({ adults: 3 });
  });

  it("sends an empty remark, because clearing one is a change", () => {
    expect(bookingChanges({ ...stay, remarks: "Late arrival" }, same)).toEqual({ remarks: "" });
  });

  /**
   * A percentage keeps what was typed beside what it came to. Comparing
   * against `discount` — the money — makes "10%" look changed on every
   * save of a booking whose rooms cost anything at all.
   */
  it("compares a percentage against what was typed, not what it came to", () => {
    const tenPercent = {
      ...stay,
      discount: 1300,
      discountKind: "PERCENT" as const,
      discountValue: 10,
    };
    expect(bookingChanges(tenPercent, { ...same, discount: 10, discountKind: "PERCENT" })).toEqual(
      {},
    );
  });

  /** The API refuses a change of kind that does not say the new figure. */
  it("sends the figure whenever the kind changes", () => {
    expect(bookingChanges(stay, { ...same, discountKind: "PERCENT", discount: 10 })).toEqual({
      discount: 10,
      discountKind: "PERCENT",
    });
  });

  it("sends the kind whenever the figure changes", () => {
    expect(bookingChanges(stay, { ...same, discount: 500 })).toEqual({
      discount: 500,
      discountKind: "FLAT",
    });
  });

  /**
   * An agent's form has no discount box, so an agent's patch must have no
   * discount in it — the API refuses one outright, and refusing a whole
   * save because of a field the person never saw is the worst kind of
   * error message.
   */
  it("leaves the discount out entirely when the person may not change it", () => {
    const patch = bookingChanges(stay, { ...same, adults: 3, discount: 500 }, {
      mayChangeDiscount: false,
    });
    expect(patch).toEqual({ adults: 3 });
  });
});
