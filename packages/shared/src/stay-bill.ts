/**
 * A booking's items, as a bill a guest can read.
 *
 * `BookingDetail.items` are not a bill. They are four kinds of row with
 * three different meanings of `qty`, and the rules for reading them are easy
 * to get subtly wrong:
 *
 *   - a ROOM line always has `qty: 1` — one room — and is charged per night,
 *     so its amount is `unitPrice × nights`. This file had `qty` as the
 *     nights on its first afternoon, and a three-night stay at ৳6,500 drew a
 *     bill line of ৳6,500 under a total of ৳19,500. The items are created in
 *     `bookings.service.ts` with `qty: 1`, and the route sends `nights` as
 *     the count of that item's `BookingNight` rows;
 *   - an EXTRA_PERSON line's `qty` is *people × nights*, so the people are
 *     `qty / nights`;
 *   - a CHARGE line's `qty` counts the thing, and `chargeKind` decides
 *     whether it reads Service, Damage or Fine;
 *   - FB and ACTIVITY each get their own word.
 *
 * The console did all of that inline, in JSX, across four `.filter()` calls
 * in a single expression — including a division by `nights` that is zero on
 * a same-day booking. The phone needs the same bill, and a guest shown one
 * total at the desk and another on a phone has been overcharged by one of
 * them. So it is one function, here, with the arithmetic in the open.
 *
 * What this does *not* do is add the lines up. The total is the server's,
 * computed with the resort's tax rules, which never reach a client. A screen
 * that summed these would be a second implementation of the bill.
 */
import type { BookingDetail } from "./api-types";
import { formatMoney, type MoneyFormat } from "./money";
import { STAY_CHARGE_LABELS, isStayChargeKind } from "./stay-charges";

export type BillLineKind = "ROOM" | "EXTRA_PERSON" | "CHARGE" | "FB" | "ACTIVITY" | "OTHER";

export interface BillLine {
  id: number;
  kind: BillLineKind;
  /** What it is: the room's name, "Damage — Broken lamp", "Restaurant". */
  label: string;
  /** How it was arrived at, or null where the label says everything. */
  detail: string | null;
  /**
   * What this line comes to, or null where the reader may not see it.
   *
   * A resort can hide its rates from the agents who sell it, and the detail
   * route then sends `unitPrice: null`. A line that quietly reads ৳0 tells
   * that agent something false about a stay they are answerable for.
   */
  amount: number | null;
}

/** Rooms first, because that is what the stay is; then what was added to it. */
const ORDER: BillLineKind[] = ["ROOM", "EXTRA_PERSON", "CHARGE", "FB", "ACTIVITY", "OTHER"];

const nightWord = (n: number) => `${n} night${n === 1 ? "" : "s"}`;

export function billLines(
  booking: Pick<BookingDetail, "items" | "nights">,
  money: MoneyFormat = {},
): BillLine[] {
  const nights = booking.nights;

  const lines = booking.items.map((item): BillLine => {
    const hidden = item.unitPrice === null || item.unitPrice === undefined;
    const unit = Number(item.unitPrice ?? 0);
    const qty = Number(item.qty ?? 0);
    /** Never NaN on a bill, whatever the row holds. */
    const money0 = (n: number) => (Number.isFinite(n) ? n : 0);
    const kind = (ORDER.includes(item.kind as BillLineKind) ? item.kind : "OTHER") as BillLineKind;
    // `qty` counts the thing for every kind but a room, where it is always 1
    const amount = hidden ? null : money0(unit * qty);

    if (kind === "ROOM") {
      // the item's own nights, because a booking's `nights` is the stay and
      // an item can have been released from some of them; the stay's length
      // is the fallback, never 1
      const nightsHere = item.nights > 0 ? item.nights : nights;
      return {
        id: item.id,
        kind,
        label: item.room?.name ?? "Room",
        detail: hidden
          ? null
          : `${formatMoney(unit, { ...money, decimals: 0 })} × ${nightWord(nightsHere)}`,
        amount: hidden ? null : money0(unit * qty * nightsHere),
      };
    }

    if (kind === "EXTRA_PERSON") {
      // `qty` is people × nights. A same-day booking has no nights, and
      // dividing by it is how "Infinity × 2 nights" reaches a screen.
      const people = nights > 0 ? qty / nights : qty;
      const room = item.room?.name;
      return {
        id: item.id,
        kind,
        label: `Extra person${people === 1 ? "" : "s"}${room ? ` — ${room}` : ""}`,
        detail: nights > 0 ? `${people} × ${nightWord(nights)}` : `${people}`,
        amount,
      };
    }

    if (kind === "CHARGE") {
      const what = isStayChargeKind(item.chargeKind)
        ? STAY_CHARGE_LABELS[item.chargeKind]
        : "Charge";
      return {
        id: item.id,
        kind,
        label: item.label ? `${what} — ${item.label}` : what,
        detail: qty > 1 ? `× ${qty}` : null,
        amount,
      };
    }

    if (kind === "FB") {
      return { id: item.id, kind, label: "Restaurant", detail: item.label, amount };
    }

    if (kind === "ACTIVITY") {
      return { id: item.id, kind, label: item.slot?.name ?? "Activity", detail: null, amount };
    }

    return { id: item.id, kind: "OTHER", label: item.label ?? item.kind, detail: null, amount };
  });

  return lines.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

/**
 * The rooms a stay is in, read off its items.
 *
 * `GET /bookings/:id` sends no `rooms` field and never has — the list route
 * does, the detail route does not, and `BookingDetail extends BookingRow`
 * claimed otherwise until 2026-09-20. The phone's detail screen trusted the
 * type and died on `b.rooms.filter(...)` at the first real booking.
 *
 * Each room once, however many lines mention it: an extra-person line
 * carries the room it is for, so counting those would show "1 Camellia,
 * 1 Camellia" on a booking for one room.
 */
export function roomNames(booking: Pick<BookingDetail, "items">): string[] {
  const seen = new Map<number, string>();
  for (const item of booking.items) {
    if (!item.room) continue;
    if (item.kind !== "ROOM" && item.kind !== "EXTRA_PERSON") continue;
    if (!seen.has(item.room.id)) seen.set(item.room.id, item.room.name);
  }
  return [...seen.values()];
}

/**
 * What was put on the bill beyond the stay.
 *
 * Water from the minibar, a broken lamp, a smoking fine. The check-out
 * screen lists them so each can be taken off again before the invoice is
 * issued — and an issued invoice does not take another line, which is why
 * that screen is where they are added at all.
 *
 * Only `CHARGE` rows: the rooms are the stay, and food and activities have
 * their own bills and are not removed from here.
 */
export function chargeLines(booking: Pick<BookingDetail, "items">) {
  return booking.items.filter((item) => item.kind === "CHARGE");
}
