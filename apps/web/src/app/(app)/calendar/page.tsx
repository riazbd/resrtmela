"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { client, type CalendarBooking, type Room, money } from "@/lib/api";
import { useApi, keys } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import { Button, Card } from "@/components/ui";
import { ErrorState, Skeleton } from "@/components/error-state";
import { mergeRuns } from "@/lib/calendar-bars";
import { todayIn, addDaysIso } from "@/lib/resort-dates";

/**
 * The month, as a chart of stays.
 *
 * This grid used to draw every night as its own square. A three-night booking
 * was three disconnected blocks, each with the guest's first name crammed in at
 * 9px and truncated, so the screen was a mosaic of unreadable letter fragments
 * that the eye had to reassemble into bookings. Seven colours competed in it —
 * six states plus an orange for partial payment — and two of those states,
 * CANCELLED and NO_SHOW, were nights the resort could sell that evening,
 * painted as taken. A front desk reading that turned guests away from empty
 * rooms.
 *
 * The states that do not hold a room are gone at the source (`calendar()`
 * filters now), which leaves four that mean something, and a stay is one bar
 * with the width of the whole stay to write a name in. Money is the other thing
 * a desk needs from this screen, so it rides underneath as a stripe rather than
 * as a fifth colour fighting the first four.
 */

/** The four states that actually hold a room. */
const BAR: Record<string, { fill: string; text: string; label: string }> = {
  PENDING: { fill: "bg-amber-400", text: "text-amber-950", label: "Pending" },
  CONFIRMED: { fill: "bg-emerald-500", text: "text-white", label: "Confirmed" },
  CHECKED_IN: { fill: "bg-sky-600", text: "text-white", label: "In house" },
  CHECKED_OUT: { fill: "bg-slate-300", text: "text-slate-700", label: "Departed" },
};

/**
 * What is still owed, as a stripe under the bar.
 *
 * Payment used to be a *colour* — an orange block — which meant a partially
 * paid confirmed booking had to choose between showing its state and showing
 * its money. Two facts, two channels: the fill says where the stay is, the
 * stripe says what is outstanding.
 */
const DUE_STRIPE: Record<string, string> = {
  UNPAID: "bg-red-500",
  PARTIAL: "bg-amber-500",
};

/** Thursday and Friday — the nights this market prices differently. */
const WEEKEND = new Set([4, 5]);
const SPANS = [7, 14, 30] as const;

const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
const dayNumber = (day: string) => Number(day.slice(8, 10));
const monthLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

export default function CalendarPage() {
  const { activeResort } = useAuth();
  const router = useRouter();
  // the resort's today, not the browser's: from 18:00 in Dhaka they differ, and
  // a calendar that opens on tomorrow is a calendar nobody trusts
  const today = todayIn(activeResort?.timezone);
  const [start, setStart] = useState(today);
  const [span, setSpan] = useState<number>(14);

  const days = useMemo(
    () => Array.from({ length: span }, (_, i) => addDaysIso(start, i)),
    [start, span],
  );
  const end = addDaysIso(start, span);

  // the room list is shared with every other screen and cached under one key;
  // paging the calendar only refetches the bookings
  const roomsQ = useApi(keys.rooms(activeResort?.id), () => client.rooms.list(activeResort!.id), {
    enabled: !!activeResort,
  });
  const calQ = useApi(
    keys.calendar(activeResort?.id, start, end),
    () => client.calendar(activeResort!.id, start, end),
    { enabled: !!activeResort, placeholderData: (prev) => prev },
  );

  /**
   * Out-of-service rooms stay on the grid.
   *
   * They used to be filtered out, so a room under maintenance simply vanished
   * — and a desk that cannot see it has no way to tell "not bookable" from
   * "does not exist", or to notice that a room has been out for three weeks.
   * It is drawn as a band across the row instead. Retired rooms really are
   * gone, and the API leaves them out.
   */
  const all = useMemo(() => roomsQ.data ?? [], [roomsQ.data]);
  const sellable = useMemo(() => all.filter((r) => r.status === "ACTIVE"), [all]);
  // what can be sold first; the rest sink to the bottom, still visible. A desk
  // reads this screen for tonight, and a maintenance room interleaved between
  // two sellable ones is four rows of hatching in the way of the answer.
  const rooms = useMemo(
    () => [...sellable, ...all.filter((r) => r.status !== "ACTIVE")],
    [all, sellable],
  );
  const bookings: CalendarBooking[] = useMemo(() => calQ.data?.bookings ?? [], [calQ.data]);
  const loading = roomsQ.isPending || calQ.isPending;
  const error = roomsQ.error ?? calQ.error;

  /** `roomId|YYYY-MM-DD` → the stay holding it. Checkout morning is free. */
  const held = useMemo(() => {
    const map = new Map<string, CalendarBooking>();
    for (const b of bookings) {
      const from = b.checkIn.slice(0, 10);
      const to = b.checkOut.slice(0, 10);
      for (const day of days) {
        if (day < from || day >= to) continue;
        for (const r of b.rooms) if (r.id !== null) map.set(`${r.id}|${day}`, b);
      }
    }
    return map;
  }, [bookings, days]);

  /** How full each day is — the strip that answers "how are we doing" at a glance. */
  const occupancy = useMemo(
    () =>
      days.map((day) => ({
        day,
        taken: sellable.reduce((n, r) => n + (held.has(`${r.id}|${day}`) ? 1 : 0), 0),
      })),
    [days, sellable, held],
  );

  function openStay(id: number) {
    router.push(`/bookings?id=${id}`);
  }

  /** A free stretch is offered whole; the form is where it gets trimmed. */
  function bookRun(roomId: number, from: string, nights: number) {
    router.push(
      `/bookings?new=1&roomId=${roomId}&checkIn=${from}&checkOut=${addDaysIso(from, nights)}`,
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setStart(addDaysIso(start, -span))}>
              ←
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setStart(today)}>
              Today
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setStart(addDaysIso(start, span))}>
              →
            </Button>
          </div>
          <span className="text-sm font-semibold text-slate-700">
            {dayNumber(start)} {monthLabel(start)} – {dayNumber(addDaysIso(end, -1))}{" "}
            {monthLabel(addDaysIso(end, -1))}
          </span>
          <div className="ml-1 flex overflow-hidden rounded-lg border border-slate-200">
            {SPANS.map((n) => (
              <button
                key={n}
                onClick={() => setSpan(n)}
                className={`px-2.5 py-1 text-xs font-semibold transition ${
                  span === n ? "bg-brand-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                {n}d
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {Object.entries(BAR).map(([state, look]) => (
            <span key={state} className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className={`h-2.5 w-4 rounded-sm ${look.fill}`} />
              {look.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="h-2.5 w-4 rounded-sm bg-slate-200 ring-1 ring-inset ring-red-500" />
            Money owed
          </span>
        </div>
      </div>

      <Card className="overflow-hidden !p-0">
        {error ? (
          <div className="p-4">
            <ErrorState error={error} />
          </div>
        ) : loading ? (
          <Skeleton rows={6} />
        ) : rooms.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No rooms yet — add them under Rooms.</p>
        ) : (
          <div className="overflow-x-auto">
            {/*
              Only the room column is given a width. In a fixed layout, space
              left over is shared out among the columns that ask for none — so
              every day column comes out identical, whatever a bar spanning
              four of them contains. Giving all of them a width instead shares
              the surplus in proportion, and the days drifted apart.
            */}
            <table className="w-full min-w-[860px] table-fixed border-collapse">
              <colgroup>
                <col className="w-[150px]" />
                {days.map((day) => (
                  <col key={day} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 min-w-[150px] border-b border-r border-slate-200 bg-white px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Room
                  </th>
                  {days.map((day) => {
                    const isToday = day === today;
                    const weekend = WEEKEND.has(weekdayOf(day));
                    const weekStart = weekdayOf(day) === 6;
                    return (
                      <th
                        key={day}
                        className={`border-b border-slate-200 px-1 py-1.5 text-center ${
                          weekStart ? "border-l border-l-slate-300" : ""
                        } ${isToday ? "bg-brand-50" : ""}`}
                      >
                        <div
                          className={`text-[10px] font-semibold uppercase ${
                            weekend ? "text-amber-600" : "text-slate-300"
                          }`}
                        >
                          {new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
                            weekday: "narrow",
                            timeZone: "UTC",
                          })}
                        </div>
                        <div
                          className={
                            isToday
                              ? "mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white"
                              : "text-sm font-semibold text-slate-500"
                          }
                        >
                          {dayNumber(day)}
                        </div>
                      </th>
                    );
                  })}
                </tr>

                {/* How full each night is, before anyone reads a single room row. */}
                <tr>
                  <th className="sticky left-0 z-20 border-b border-r border-slate-200 bg-white px-3 py-1 text-left text-[10px] font-medium uppercase tracking-wide text-slate-400">
                    Sold
                  </th>
                  {occupancy.map(({ day, taken }) => {
                    const share = sellable.length ? taken / sellable.length : 0;
                    return (
                      <td
                        key={day}
                        title={`${taken} of ${sellable.length} sellable rooms on ${day}`}
                        className={`border-b border-slate-200 px-1 pb-1.5 text-center text-[10px] font-bold tabular-nums ${
                          weekdayOf(day) === 6 ? "border-l border-l-slate-300" : ""
                        } ${
                          share === 0
                            ? "text-slate-300"
                            : share < 0.5
                              ? "text-slate-500"
                              : share < 0.9
                                ? "text-amber-600"
                                : "text-emerald-700"
                        }`}
                      >
                        {taken}
                      </td>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {rooms.map((room: Room) => {
                  if (room.status === "OUT_OF_SERVICE") {
                    return (
                      <tr key={room.id} className="group">
                        <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-1.5 group-hover:bg-slate-50">
                          <div className="text-sm font-medium text-slate-400 line-through">{room.name}</div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Out of service
                          </div>
                        </td>
                        <td colSpan={days.length} className="border-b border-slate-100 p-0.5">
                          <div
                            title={`${room.name} is out of service — it cannot be sold`}
                            className="h-9 rounded-md bg-[repeating-linear-gradient(45deg,#f8fafc,#f8fafc_6px,#eef2f7_6px,#eef2f7_12px)]"
                          />
                        </td>
                      </tr>
                    );
                  }
                  const runs = mergeRuns(
                    days,
                    (day) => held.get(`${room.id}|${day}`) ?? null,
                    (b) => b.id,
                  );
                  return (
                    <tr key={room.id} className="group">
                      <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-1.5 group-hover:bg-slate-50">
                        <div className="text-sm font-medium text-slate-700">{room.name}</div>
                        <div className="text-[10px] text-slate-400">
                          {room.roomType?.name ? `${room.roomType.name} · ` : ""}
                          {money(Number(room.baseRate))}
                        </div>
                      </td>

                      {runs.map((run) => {
                        const edge = weekdayOf(run.from) === 6 ? "border-l border-l-slate-300" : "";
                        if (!run.value) {
                          /**
                           * Free nights stay one cell each.
                           *
                           * Merging them was the wrong call and looked it: a
                           * row with nothing booked became a single pale bar
                           * fourteen days wide, which took the column grid and
                           * the week lines with it — the body of the table
                           * stopped lining up with its own header. A stay is
                           * one thing and reads as one bar; an empty night is
                           * one night, and one thing to click.
                           */
                          return Array.from({ length: run.nights }, (_, i) => {
                            const night = addDaysIso(run.from, i);
                            return (
                              <td
                                key={night}
                                className={`border-b border-slate-100 p-0.5 ${
                                  weekdayOf(night) === 6 ? "border-l border-l-slate-300" : ""
                                }`}
                              >
                                <button
                                  onClick={() => bookRun(room.id, night, 1)}
                                  title={`${room.name} free on ${night}`}
                                  className="h-9 w-full rounded bg-slate-50 transition hover:bg-brand-100 hover:ring-1 hover:ring-inset hover:ring-brand-400"
                                />
                              </td>
                            );
                          });
                        }
                        const b = run.value;
                        const look = BAR[b.state] ?? BAR.CONFIRMED!;
                        const stripe = DUE_STRIPE[b.paymentState];
                        // a stay that started before this window, or runs past
                        // it, is squared off on that side so the bar reads as
                        // continuing rather than beginning here
                        const opensHere = b.checkIn.slice(0, 10) >= run.from;
                        const endsHere = b.checkOut.slice(0, 10) <= addDaysIso(run.from, run.nights);
                        return (
                          <td
                            key={run.from}
                            colSpan={run.nights}
                            className={`border-b border-slate-100 p-0.5 ${edge}`}
                          >
                            <button
                              onClick={() => openStay(b.id)}
                              title={`${b.code} · ${b.guestName}${b.agentName ? ` · agent ${b.agentName}` : ""} · ${look.label}${stripe ? " · money owed" : ""}`}
                              className={`relative flex h-9 w-full items-center overflow-hidden px-2 text-left transition hover:brightness-110 ${look.fill} ${look.text} ${
                                opensHere ? "rounded-l-md" : ""
                              } ${endsHere ? "rounded-r-md" : ""}`}
                            >
                              <span className="truncate text-[11px] font-semibold leading-none">
                                {b.guestName}
                              </span>
                              {run.nights > 2 && (
                                <span className="ml-1.5 truncate text-[10px] font-medium leading-none opacity-70">
                                  {b.code}
                                </span>
                              )}
                              {stripe && (
                                <span
                                  className={`absolute inset-x-0 bottom-0 h-1 ${stripe}`}
                                  aria-hidden
                                />
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
