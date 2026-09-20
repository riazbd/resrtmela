/**
 * A room that needs cleaning is still for sale (2026-09-21).
 *
 * Housekeeping shipped the day before and stopped at its own screen. The
 * room list said "1 Camellia · Deluxe Twin" and the new-booking grid
 * offered it at ৳4,500, while the housekeeping list two taps away said
 * the guest left this morning and nobody had been in yet. A walk-in gets
 * that room, and the desk finds out when the guest comes back down.
 *
 * The fix is a warning, not a lock, and that is the same decision the
 * housekeeping design already took for check-in: a clerk who cannot give
 * a guest a room because of a checkbox will go round the app, and then
 * the app knows nothing. So `dirty` is `sellable`.
 *
 * Order matters and is not arbitrary. Busy is the hard one — those
 * nights are gone. Out of service is the room itself. Needing cleaning
 * is a job somebody can do in twenty minutes, so it comes last and it
 * does not stop the sale.
 *
 * **It only counts for tonight.** A room dirty this morning tells you
 * nothing about a booking that starts in October — it will have been
 * cleaned forty times by then. The state is today's, so the caller says
 * whether today is the day, and the rule ignores it otherwise. Getting
 * this wrong would put "needs cleaning" on every room in every future
 * search and teach everyone to ignore the words.
 */
import { describe, expect, it } from "vitest";
import { roomOffer } from "../src/new-booking";

const room = (over: Partial<Parameters<typeof roomOffer>[0]> = {}) => ({
  status: "ACTIVE",
  busyNights: [] as string[],
  housekeeping: "CLEAN",
  ...over,
});

const tonight = { arrivingToday: true };

describe("a room that needs cleaning is still for sale", () => {
  it("says a clean room has nothing to report", () => {
    expect(roomOffer(room(), tonight)).toEqual({ sellable: true, why: "free", note: null });
  });

  it("warns about a room the last guest left dirty", () => {
    const offer = roomOffer(room({ housekeeping: "DIRTY" }), tonight);
    expect(offer.why).toBe("dirty");
    expect(offer.note).toBe("needs cleaning");
  });

  it("lets the room be sold anyway, because a checkbox does not house people", () => {
    expect(roomOffer(room({ housekeeping: "DIRTY" }), tonight).sellable).toBe(true);
  });

  it("says a room being cleaned right now is being cleaned", () => {
    const offer = roomOffer(room({ housekeeping: "CLEANING" }), tonight);
    expect(offer.why).toBe("dirty");
    expect(offer.note).toBe("being cleaned");
    expect(offer.sellable).toBe(true);
  });
});

describe("what still comes first", () => {
  it("calls a busy room busy, dirty or not", () => {
    const offer = roomOffer(room({ busyNights: ["2026-09-21"], housekeeping: "DIRTY" }), tonight);
    expect(offer.why).toBe("busy");
    expect(offer.sellable).toBe(false);
  });

  it("calls a closed room closed, dirty or not", () => {
    const offer = roomOffer(room({ status: "OUT_OF_SERVICE", housekeeping: "DIRTY" }), tonight);
    expect(offer.why).toBe("closed");
    expect(offer.sellable).toBe(false);
  });
});

describe("only tonight's room is judged on tonight's state", () => {
  /**
   * The whole reason the caller has to say. Without this, every agent
   * searching for a room in December would be told a third of the resort
   * needs cleaning, which is true this morning and meaningless to them.
   */
  it("says nothing about cleaning for a stay that starts another day", () => {
    expect(roomOffer(room({ housekeeping: "DIRTY" }))).toEqual({
      sellable: true,
      why: "free",
      note: null,
    });
    expect(roomOffer(room({ housekeeping: "DIRTY" }), { arrivingToday: false }).why).toBe("free");
  });

  it("still refuses a busy room on any day", () => {
    expect(roomOffer(room({ busyNights: ["2026-12-01"] })).why).toBe("busy");
  });
});

describe("a room whose state nobody sent", () => {
  /**
   * An older API, or a payload written before housekeeping existed. A
   * missing state is not a dirty room, and guessing either way in a
   * warning is worse than staying quiet.
   */
  it("says nothing rather than guessing", () => {
    expect(roomOffer({ status: "ACTIVE", busyNights: [] }, tonight).why).toBe("free");
  });
});
