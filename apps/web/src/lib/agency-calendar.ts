/**
 * Stays → a month grid.
 *
 * The API sends spans ("room 3, the 5th to the 8th"); the screen draws squares
 * ("room 3, the 6th"). Turning one into the other is the whole of the agency
 * calendar's arithmetic, and it is kept here rather than in the component so
 * the rule that decides what a square means can be tested on its own.
 */

/** One occupied span, exactly as `/agent/calendar` sends it. */
export interface CalendarStay {
  roomId: number;
  checkIn: string;
  checkOut: string;
  mine: boolean;
  state: string;
  guestName: string | null;
  code: string | null;
}

export interface CalendarCell {
  mine: boolean;
  guestName: string | null;
  code: string | null;
}

const DAY_MS = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Every night each room is not free, keyed `roomId|YYYY-MM-DD`.
 *
 * A stay covers check-in up to *but not including* check-out. The guest leaves
 * on the checkout morning and the room is sellable that night — painting it as
 * taken would quietly lose a night on every booking in the month.
 */
export function occupancyCells(stays: CalendarStay[]): Map<string, CalendarCell> {
  const cells = new Map<string, CalendarCell>();
  for (const s of stays) {
    const start = new Date(s.checkIn);
    const end = new Date(s.checkOut);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    for (let t = start.getTime(); t < end.getTime(); t += DAY_MS) {
      cells.set(`${s.roomId}|${iso(new Date(t))}`, {
        mine: s.mine,
        guestName: s.guestName,
        code: s.code,
      });
    }
  }
  return cells;
}
