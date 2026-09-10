/**
 * Turning stays into a month grid.
 *
 * The grid is the whole feature — an agent reads a room's row and decides
 * whether to offer those dates — so the two rules that decide what a square
 * means are worth holding down here rather than inside a component.
 *
 * **A checkout morning is a free night.** A stay from the 5th to the 8th
 * occupies the 5th, 6th and 7th; the guest leaves on the 8th and the room can
 * be sold that night. Painting the checkout day as taken loses a sellable night
 * on every single booking in the month, which is exactly the kind of quiet
 * arithmetic error that costs a resort money without anyone noticing.
 *
 * **Whose night it is survives the merge.** Two stays can meet in one room, and
 * the agency's own booking must not be flattened into an anonymous grey block
 * by the one next to it.
 */
import { describe, expect, it } from "vitest";
import { occupancyCells, freeSpan, type CalendarStay } from "@/lib/agency-calendar";

const stay = (over: Partial<CalendarStay> = {}): CalendarStay => ({
  roomId: 1,
  checkIn: "2026-10-05T00:00:00.000Z",
  checkOut: "2026-10-08T00:00:00.000Z",
  mine: false,
  state: "CONFIRMED",
  guestName: null,
  code: null,
  ...over,
});

const taken = (cells: ReturnType<typeof occupancyCells>, roomId: number) =>
  [...cells.keys()].filter((k) => k.startsWith(`${roomId}|`)).map((k) => k.split("|")[1]).sort();

describe("occupancyCells", () => {
  it("fills every night of the stay", () => {
    expect(taken(occupancyCells([stay()]), 1)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
  });

  it("leaves the checkout morning free, because the room can be sold that night", () => {
    expect(taken(occupancyCells([stay()]), 1)).not.toContain("2026-10-08");
  });

  it("marks a one-night stay as exactly one night", () => {
    const cells = occupancyCells([
      stay({ checkIn: "2026-10-05T00:00:00.000Z", checkOut: "2026-10-06T00:00:00.000Z" }),
    ]);
    expect(taken(cells, 1)).toEqual(["2026-10-05"]);
  });

  it("keeps the agency's own night its own when another stay sits beside it", () => {
    const cells = occupancyCells([
      stay({ checkIn: "2026-10-01T00:00:00.000Z", checkOut: "2026-10-03T00:00:00.000Z" }),
      stay({
        checkIn: "2026-10-03T00:00:00.000Z",
        checkOut: "2026-10-05T00:00:00.000Z",
        mine: true,
        guestName: "Our Client",
        code: "BK-00042",
      }),
    ]);
    expect(cells.get("1|2026-10-02")).toMatchObject({ mine: false, guestName: null });
    expect(cells.get("1|2026-10-03")).toMatchObject({ mine: true, guestName: "Our Client" });
    expect(cells.get("1|2026-10-04")!.code).toBe("BK-00042");
  });

  it("keeps rooms apart", () => {
    const cells = occupancyCells([stay(), stay({ roomId: 2 })]);
    expect(taken(cells, 1)).toHaveLength(3);
    expect(taken(cells, 2)).toHaveLength(3);
  });

  it("counts nothing for a stay whose dates are the wrong way round", () => {
    const cells = occupancyCells([
      stay({ checkIn: "2026-10-08T00:00:00.000Z", checkOut: "2026-10-05T00:00:00.000Z" }),
    ]);
    expect(cells.size).toBe(0);
  });
});

/**
 * Picking a stay, not a night.
 *
 * Every free square opened the booking form for that one night. An agent
 * planning three nights for a group clicked, booked one night, went back, and
 * did it again — or gave up and used the form. A calendar you cannot drag a
 * stay across is a report with links on it.
 *
 * The rule is deliberately strict: a span is offered only when *every* night in
 * it is free in that room. Offering a range with a taken night in the middle
 * would hand the agent a booking the engine is about to refuse, after they have
 * quoted it to a guest.
 */
describe("choosing a span of nights", () => {
  const taken = (roomId: number, night: string) =>
    new Map([[`${roomId}|${night}`, { mine: false, guestName: null, code: null }]]);

  it("turns two clicks into a stay", () => {
    expect(freeSpan(new Map(), 1, "2026-10-05", "2026-10-07")).toEqual({
      from: "2026-10-05",
      // three nights: the 5th, 6th and 7th — so checkout is the 8th
      to: "2026-10-08",
    });
  });

  it("does not care which end was clicked first", () => {
    expect(freeSpan(new Map(), 1, "2026-10-07", "2026-10-05")).toEqual({
      from: "2026-10-05",
      to: "2026-10-08",
    });
  });

  it("makes one night a one-night stay", () => {
    expect(freeSpan(new Map(), 1, "2026-10-05", "2026-10-05")).toEqual({
      from: "2026-10-05",
      to: "2026-10-06",
    });
  });

  it("refuses a span with a taken night inside it", () => {
    expect(freeSpan(taken(1, "2026-10-06"), 1, "2026-10-05", "2026-10-07")).toBeNull();
  });

  it("ignores a night taken in a different room", () => {
    expect(freeSpan(taken(2, "2026-10-06"), 1, "2026-10-05", "2026-10-07")).toEqual({
      from: "2026-10-05",
      to: "2026-10-08",
    });
  });

  it("refuses a span longer than anyone means to click", () => {
    // a mis-click on January and then December must not offer a year-long stay
    expect(freeSpan(new Map(), 1, "2026-01-01", "2026-12-31")).toBeNull();
  });
});
