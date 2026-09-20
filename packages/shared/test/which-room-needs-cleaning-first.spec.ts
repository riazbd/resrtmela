/**
 * Housekeeping: three states, and the order they are read in.
 *
 * `HOUSEKEEPING` has been a role since phase 0 and `permissionsFor`
 * answers it with an empty array, so a housekeeper could be added, given
 * a password, and sign in to nothing at all. This is the first code that
 * role has ever had.
 *
 * The order is the whole design. A housekeeper on the second floor with
 * a mop does not read a list; they read the top of one. So the room
 * whose guest left this morning, with somebody arriving into it tonight,
 * is first — and a clean room is last, because it is already done.
 *
 * `nextHousekeepingState` says the state the button moves *to*, not the
 * one the room is in. `room-status.ts` records getting exactly that
 * backwards, which is why it is written down rather than worked out at
 * each call site.
 */
import { describe, expect, it } from "vitest";
import {
  HOUSEKEEPING_STATES,
  housekeepingLabel,
  housekeepingOrder,
  isHousekeepingState,
  nextHousekeepingState,
  type HousekeepingRoom,
} from "../src/housekeeping";

const room = (over: Partial<HousekeepingRoom> = {}): HousekeepingRoom => ({
  id: 1,
  name: "1 Camellia",
  housekeeping: "CLEAN",
  departedToday: false,
  arrivingToday: false,
  ...over,
});

describe("the three states a room can be in", () => {
  it("is dirty, being cleaned, or clean — and nothing else", () => {
    expect([...HOUSEKEEPING_STATES]).toEqual(["DIRTY", "CLEANING", "CLEAN"]);
  });

  it("reads as a sentence, not an enum", () => {
    expect(housekeepingLabel("DIRTY")).toBe("Needs cleaning");
    expect(housekeepingLabel("CLEANING")).toBe("Being cleaned");
    expect(housekeepingLabel("CLEAN")).toBe("Ready");
  });

  it("says something sensible about a value it does not know", () => {
    // an imported row, or a state added ahead of this list
    expect(housekeepingLabel("INSPECTED")).toBe("Inspected");
  });

  it("knows one of its own from anything else", () => {
    expect(isHousekeepingState("DIRTY")).toBe(true);
    expect(isHousekeepingState("INSPECTED")).toBe(false);
    expect(isHousekeepingState(7)).toBe(false);
  });
});

describe("the button on a room", () => {
  /**
   * The label is the destination. A dirty room's button starts the
   * cleaning; a room being cleaned is finished; a clean room can be sent
   * back, because somebody marks the wrong room and has to undo it.
   */
  it("moves a dirty room into being cleaned", () => {
    expect(nextHousekeepingState("DIRTY")).toEqual({ to: "CLEANING", label: "Start cleaning" });
  });

  it("finishes a room that is being cleaned", () => {
    expect(nextHousekeepingState("CLEANING")).toEqual({ to: "CLEAN", label: "Mark ready" });
  });

  it("lets a clean room be sent back, because people tap the wrong row", () => {
    expect(nextHousekeepingState("CLEAN")).toEqual({ to: "DIRTY", label: "Needs cleaning" });
  });
});

describe("which room needs cleaning first", () => {
  it("puts the room somebody is arriving into tonight at the top", () => {
    const rooms = [
      room({ id: 1, name: "Quiet", housekeeping: "DIRTY" }),
      room({ id: 2, name: "Urgent", housekeeping: "DIRTY", departedToday: true, arrivingToday: true }),
    ];
    expect(housekeepingOrder(rooms).map((r) => r.name)).toEqual(["Urgent", "Quiet"]);
  });

  it("puts a room emptied today above one dirty from yesterday", () => {
    const rooms = [
      room({ id: 1, name: "Yesterday", housekeeping: "DIRTY" }),
      room({ id: 2, name: "This morning", housekeeping: "DIRTY", departedToday: true }),
    ];
    expect(housekeepingOrder(rooms).map((r) => r.name)).toEqual(["This morning", "Yesterday"]);
  });

  it("puts every dirty room above every room being cleaned", () => {
    const rooms = [
      room({ id: 1, name: "Underway", housekeeping: "CLEANING", departedToday: true, arrivingToday: true }),
      room({ id: 2, name: "Untouched", housekeeping: "DIRTY" }),
    ];
    expect(housekeepingOrder(rooms).map((r) => r.name)).toEqual(["Untouched", "Underway"]);
  });

  it("puts clean rooms last, because they are done", () => {
    const rooms = [
      room({ id: 1, name: "Done", housekeeping: "CLEAN", arrivingToday: true }),
      room({ id: 2, name: "Underway", housekeeping: "CLEANING" }),
      room({ id: 3, name: "Waiting", housekeeping: "DIRTY" }),
    ];
    expect(housekeepingOrder(rooms).map((r) => r.name)).toEqual(["Waiting", "Underway", "Done"]);
  });

  /**
   * Two rooms with nothing to choose between them keep the order the
   * server sent, which is `byRoomName` — so the list reads 1, 2, 3, 10
   * and not 1, 10, 2.
   */
  it("leaves rooms the rules cannot separate in the order they came", () => {
    const rooms = [
      room({ id: 1, name: "1 Camellia", housekeeping: "DIRTY" }),
      room({ id: 2, name: "2 Lotus", housekeeping: "DIRTY" }),
      room({ id: 10, name: "10 Bakul", housekeeping: "DIRTY" }),
    ];
    expect(housekeepingOrder(rooms).map((r) => r.name)).toEqual([
      "1 Camellia",
      "2 Lotus",
      "10 Bakul",
    ]);
  });

  it("does not disturb the list it was given", () => {
    const rooms = [room({ id: 1, housekeeping: "CLEAN" }), room({ id: 2, housekeeping: "DIRTY" })];
    const before = rooms.map((r) => r.id);
    housekeepingOrder(rooms);
    expect(rooms.map((r) => r.id)).toEqual(before);
  });

  it("is an empty list when the resort has no rooms", () => {
    expect(housekeepingOrder([])).toEqual([]);
  });
});
