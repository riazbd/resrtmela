/**
 * A booking form that will not book says why.
 *
 * "Create booking (3 rooms)" sat greyed out with three rooms picked, the dates
 * set, extra persons and an advance typed in — because the guest's name was
 * empty, which was scrolled out of sight. A disabled button gives no reason,
 * so it read as "three rooms cannot go on one booking".
 *
 * The button stays pressable; pressing it names what is missing.
 */
import { describe, expect, it } from "vitest";
import { whatTheBookingNeeds } from "@rh/shared";

describe("what a booking still needs", () => {
  it("nothing, when there is a room and a guest", () => {
    expect(whatTheBookingNeeds({ rooms: 3, guestName: "Mia" })).toEqual([]);
  });

  it("the guest's name, named as such", () => {
    expect(whatTheBookingNeeds({ rooms: 3, guestName: "  " })).toEqual(["guestName"]);
  });

  it("a room", () => {
    expect(whatTheBookingNeeds({ rooms: 0, guestName: "Mia" })).toEqual(["rooms"]);
  });

  it("both, rooms first because that is the top of the form", () => {
    expect(whatTheBookingNeeds({ rooms: 0, guestName: "" })).toEqual(["rooms", "guestName"]);
  });
});
