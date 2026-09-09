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
import { occupancyCells, type CalendarStay } from "@/lib/agency-calendar";

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
