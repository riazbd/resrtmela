/**
 * Arriving at the bookings screen from somewhere else.
 *
 * Three screens hand a booking off to `/bookings`: the room search ("Book
 * here"), the new agency calendar (clicking a free night), and the day sheet.
 * Each of them already knows the resort, the room and the dates, and the whole
 * value of the hand-off is that the agent does not type them again.
 *
 * Two things made that not work. The search page sent `from`/`to` while the
 * bookings page read `checkIn`/`checkOut`, so the dates were dropped in
 * silence — the agent picked their dates, clicked through, and got an empty
 * form. And `resortId` was never read at all: an agent whose active resort was
 * A could search resort B, click Book here, and land on a form for A, with the
 * page showing B's name nowhere. That is worse than losing the dates, because
 * it is wrong rather than empty, and nothing on the screen says so.
 *
 * So the reading of the URL is one function, and these are its rules.
 */
import { describe, expect, it } from "vitest";
import { bookingHandoff } from "@/lib/booking-handoff";

const params = (qs: string) => new URLSearchParams(qs);

describe("bookingHandoff", () => {
  it("carries the resort, so the form is for the resort that was clicked", () => {
    expect(bookingHandoff(params("resortId=7")).resortId).toBe(7);
  });

  it("reads checkIn and checkOut", () => {
    const h = bookingHandoff(params("checkIn=2026-11-01&checkOut=2026-11-03"));
    expect(h.checkIn).toBe("2026-11-01");
    expect(h.checkOut).toBe("2026-11-03");
  });

  it("accepts from and to as the same thing, because the search page sends those", () => {
    const h = bookingHandoff(params("from=2026-11-01&to=2026-11-03"));
    expect(h.checkIn).toBe("2026-11-01");
    expect(h.checkOut).toBe("2026-11-03");
  });

  it("prefers the explicit names when both are present", () => {
    const h = bookingHandoff(params("from=2026-01-01&to=2026-01-02&checkIn=2026-11-01&checkOut=2026-11-03"));
    expect(h.checkIn).toBe("2026-11-01");
    expect(h.checkOut).toBe("2026-11-03");
  });

  it("carries a room when one was chosen", () => {
    expect(bookingHandoff(params("roomId=42")).roomId).toBe(42);
  });

  it("opens the new-booking form when asked, and only then", () => {
    expect(bookingHandoff(params("new=1")).openNew).toBe(true);
    expect(bookingHandoff(params("")).openNew).toBe(false);
  });

  it("opens the form on its own when dates arrived, because that is why the agent clicked", () => {
    expect(bookingHandoff(params("from=2026-11-01&to=2026-11-03")).openNew).toBe(true);
  });

  it("ignores rubbish rather than passing NaN to a form", () => {
    const h = bookingHandoff(params("resortId=abc&roomId=&checkIn="));
    expect(h.resortId).toBeNull();
    expect(h.roomId).toBeNull();
    expect(h.checkIn).toBeNull();
  });

  it("gives an empty hand-off for a plain visit", () => {
    expect(bookingHandoff(params(""))).toEqual({
      resortId: null,
      roomId: null,
      checkIn: null,
      checkOut: null,
      focusId: null,
      openNew: false,
    });
  });
});
