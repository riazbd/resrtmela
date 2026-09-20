/**
 * Which nights a stay holds, and what a colour on a calendar means
 * (2026-09-20).
 *
 * `lib/calendar-colors.ts` in the console states the rule and then writes it
 * in Tailwind classes, ending with a note: *"What the phone will share is the
 * rule above, not these strings."* This is that rule, moved so both clients
 * obey one copy of it.
 *
 * The rule the owner asked for, after reporting the calendars as "backwards":
 *
 *   - **Green is free, and nothing else is green.**
 *   - **Red is held**, and the shade says how firmly — pending palest,
 *     in-house deepest.
 *   - **Departed is grey**, because the guest has gone and the night is
 *     sellable again. Painting it red would say the opposite of what red is
 *     for here.
 *
 * And the arithmetic underneath, which is the part that has actually been
 * wrong: a stay holds `checkIn` up to but **not including** `checkOut`.
 * Checkout morning is a night the resort can sell that evening, and a
 * calendar that paints it red turns guests away from an empty room.
 */
import { describe, expect, it } from "vitest";
import { NIGHT_MEANING, isHeldState, nightsHeld, occupancyOf } from "../src/index";
import type { CalendarBooking } from "../src/api-types";

const stay = (over: Partial<CalendarBooking> = {}): CalendarBooking =>
  ({
    id: 41,
    code: "BK-00041",
    state: "CONFIRMED",
    paymentState: "PARTIAL",
    guestName: "Rafiq Hasan",
    agentName: null,
    checkIn: "2026-09-19T00:00:00.000Z",
    checkOut: "2026-09-21T00:00:00.000Z",
    rooms: [{ id: 11, name: "1 Camellia" }],
    ...over,
  }) as CalendarBooking;

const days = ["2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22"];

describe("which nights a stay holds", () => {
  /**
   * The one that matters. A two-night stay arriving on the 19th holds the
   * 19th and the 20th; the 21st is the morning they leave, and that night is
   * for sale.
   */
  it("holds from check-in up to but not including check-out", () => {
    const held = nightsHeld([stay()], days);
    expect(held.get("11|2026-09-18")).toBeUndefined();
    expect(held.get("11|2026-09-19")?.code).toBe("BK-00041");
    expect(held.get("11|2026-09-20")?.code).toBe("BK-00041");
    expect(held.get("11|2026-09-21")).toBeUndefined();
  });

  it("holds every room a party took", () => {
    const held = nightsHeld(
      [stay({ rooms: [{ id: 11, name: "1 Camellia" }, { id: 12, name: "2 Lotus" }] })],
      days,
    );
    expect(held.get("11|2026-09-19")?.code).toBe("BK-00041");
    expect(held.get("12|2026-09-19")?.code).toBe("BK-00041");
  });

  /**
   * An imported booking can have a room that no longer exists, and the API
   * sends `{ id: null }` for it. Keying a map on null puts every such stay in
   * the same cell.
   */
  it("skips a room that is no longer there", () => {
    const held = nightsHeld([stay({ rooms: [{ id: null, name: "Old cabin" }] })], days);
    expect(held.size).toBe(0);
  });

  it("takes the dates in either shape the API sends them", () => {
    const bare = nightsHeld([stay({ checkIn: "2026-09-19", checkOut: "2026-09-21" })], days);
    expect(bare.get("11|2026-09-19")?.code).toBe("BK-00041");
    expect(bare.get("11|2026-09-21")).toBeUndefined();
  });

  it("says nothing about days outside the window it was given", () => {
    const held = nightsHeld([stay()], ["2026-09-25"]);
    expect(held.size).toBe(0);
  });
});

describe("how full the resort is", () => {
  it("counts only the rooms that can be sold", () => {
    const held = nightsHeld([stay()], days);
    // the second room is out of service, so it is not in the denominator or
    // the numerator — a maintenance room is not occupancy
    const full = occupancyOf(days, [11], held);
    expect(full).toEqual([
      { day: "2026-09-18", taken: 0 },
      { day: "2026-09-19", taken: 1 },
      { day: "2026-09-20", taken: 1 },
      { day: "2026-09-21", taken: 0 },
      { day: "2026-09-22", taken: 0 },
    ]);
  });

  it("counts a room once even when two stays touch it on different days", () => {
    const held = nightsHeld(
      [stay(), stay({ id: 42, code: "BK-00042", checkIn: "2026-09-21", checkOut: "2026-09-23" })],
      days,
    );
    expect(occupancyOf(days, [11], held).map((d) => d.taken)).toEqual([0, 1, 1, 1, 1]);
  });
});

describe("what a night's colour means", () => {
  it("has a word and a firmness for each of the four states that hold a room", () => {
    expect(NIGHT_MEANING.PENDING.label).toBe("Pending");
    expect(NIGHT_MEANING.CONFIRMED.label).toBe("Confirmed");
    expect(NIGHT_MEANING.CHECKED_IN.label).toBe("In house");
    expect(NIGHT_MEANING.CHECKED_OUT.label).toBe("Departed");
  });

  /**
   * Pending is the least committed and in-house is somebody physically in
   * the room, so the shade deepens in that order. A client that draws them
   * in any other order is drawing a different rule.
   */
  it("deepens from pending to in-house", () => {
    expect(NIGHT_MEANING.PENDING.firmness).toBeLessThan(NIGHT_MEANING.CONFIRMED.firmness);
    expect(NIGHT_MEANING.CONFIRMED.firmness).toBeLessThan(NIGHT_MEANING.CHECKED_IN.firmness);
  });

  /**
   * The guest has left. The night is sellable again, so it is grey and not
   * red — red on this grid means "cannot be sold", and saying that about a
   * free night is the mistake the whole rule exists to prevent.
   */
  it("marks a departed stay as gone, so nobody paints it as held", () => {
    expect(NIGHT_MEANING.CHECKED_OUT.gone).toBe(true);
    for (const state of ["PENDING", "CONFIRMED", "CHECKED_IN"] as const) {
      expect(NIGHT_MEANING[state].gone).toBe(false);
    }
  });

  /**
   * CANCELLED and NO_SHOW are nights the resort can sell that evening. The
   * API filters them out of the calendar; this is the second gate, because
   * one of them reaching a grid paints an empty room as taken.
   */
  it("does not recognise a state that holds no room", () => {
    expect(isHeldState("CANCELLED")).toBe(false);
    expect(isHeldState("NO_SHOW")).toBe(false);
    expect(isHeldState("CHECKED_IN")).toBe(true);
  });
});
