/**
 * Reading a booking hand-off out of the URL.
 *
 * The room search, the agency calendar and the day sheet all send an agent to
 * `/bookings` with what they already know — resort, room, dates — so nobody
 * retypes it. The bookings page used to read only some of that, and under
 * different names than the search page sent, which is why this is one function
 * with tests rather than four `params.get` calls scattered through a component.
 */

export interface BookingHandoff {
  resortId: number | null;
  roomId: number | null;
  checkIn: string | null;
  checkOut: string | null;
  /** an existing booking to open, not a new one to make */
  focusId: string | null;
  openNew: boolean;
}

const num = (v: string | null): number | null => {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const str = (v: string | null): string | null => (v && v.trim() ? v : null);

export function bookingHandoff(params: URLSearchParams): BookingHandoff {
  // `from`/`to` are what the room search has always sent; `checkIn`/`checkOut`
  // are what this page has always read. Both are accepted so neither caller
  // has to be found and changed before the other works.
  const checkIn = str(params.get("checkIn")) ?? str(params.get("from"));
  const checkOut = str(params.get("checkOut")) ?? str(params.get("to"));
  return {
    resortId: num(params.get("resortId")),
    roomId: num(params.get("roomId")),
    checkIn,
    checkOut,
    focusId: str(params.get("id")),
    // arriving with dates means the agent clicked something to get here, and
    // the form they wanted is the one that is already filled in
    openNew: params.get("new") === "1" || (!!checkIn && !!checkOut),
  };
}
