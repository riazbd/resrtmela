"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, keys } from "@/lib/query";
import { Card, Empty, Select, Spinner } from "@/components/ui";
import { ErrorState } from "@/components/error-state";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { occupancyCells, freeSpan } from "@/lib/agency-calendar";
import { todayIn, monthOf, addDaysIso } from "@/lib/resort-dates";
import type { AgencyCalendar } from "@rh/shared";

/**
 * The month, for an agency.
 *
 * "Have you got anything for the 12th" is answered by the room search. This
 * answers the question that comes next — "what does November look like" — which
 * an agent planning a group has to see rather than ask about one date at a
 * time.
 *
 * A night this agency sold is theirs, in full, and opens the booking. A night
 * someone else sold is a grey block and nothing more: no name, no code, not
 * even which agency. The resort down the road sells to the same agencies, and a
 * calendar with names on it is a customer list with a date attached. A resort
 * that wants to be more open can turn guest names on in its own settings, and
 * then the blocks are labelled here too.
 */

/**
 * Dates here are `YYYY-MM-DD` strings, not `Date` objects.
 *
 * This page had its own `iso()` and `addMonths()` built on `Date.UTC`, which is
 * the eighth copy of a helper `lib/resort-dates` already owns — and the copy
 * decides which month the arrows land on. `monthOf` is anchored at midday so an
 * offset cannot drift it, and `todayIn` reads the resort's own clock rather
 * than the browser's, which from 18:00 in Dhaka is a different day.
 */
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Thursday and Friday: the two days this market prices differently. */
const WEEKEND = new Set([4, 5]);
const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

export default function AgencyCalendarPage() {
  const router = useRouter();
  const { role, activeResort } = useAuth();
  // the resort's today, not the browser's
  const today = todayIn(activeResort?.timezone);
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [resortId, setResortId] = useState<number | null>(null);
  /** The first night of a stay being picked out, waiting for its second click. */
  const [anchor, setAnchor] = useState<{ roomId: number; night: string } | null>(null);

  const from = monthOf.firstDay(month);
  const to = addDaysIso(monthOf.lastDay(month), 1);

  const { data, isLoading, error } = useApi<AgencyCalendar>(
    keys.agentCalendar(from, to),
    () => api<AgencyCalendar>(`/agent/calendar?from=${from}&to=${to}`),
  );

  const days = useMemo(() => {
    const out: Date[] = [];
    for (let d = new Date(from); iso(d) < to; d = new Date(d.getTime() + 86_400_000)) {
      out.push(new Date(d));
    }
    return out;
  }, [from, to]);

  const chosen = useMemo(() => {
    const list = data?.resorts ?? [];
    if (list.length === 0) return null;
    return list.find((r) => r.resort.id === resortId) ?? list[0]!;
  }, [data, resortId]);

  // one lookup per room-night, built once; the checkout-morning rule that
  // decides what a square means lives in `lib/agency-calendar` with its tests
  const cells = useMemo(() => occupancyCells(chosen?.stays ?? []), [chosen]);

  /**
   * First click marks the night; second click takes the stay between them.
   *
   * Every free square used to be a link that opened the form for that one
   * night, so an agent placing three nights for a group went round the loop
   * three times. A second click in a different room, or across a night someone
   * else has, starts again from there rather than offering a booking the engine
   * would refuse after it had been quoted.
   */
  function pickNight(roomId: number, night: string) {
    if (!chosen) return;
    if (!anchor || anchor.roomId !== roomId) {
      setAnchor({ roomId, night });
      return;
    }
    const span = freeSpan(cells, roomId, anchor.night, night);
    if (!span) {
      setAnchor({ roomId, night });
      return;
    }
    setAnchor(null);
    router.push(
      `/bookings?resortId=${chosen.resort.id}&roomId=${roomId}&checkIn=${span.from}&checkOut=${span.to}&new=1`,
    );
  }

  if (role !== "AGENT") return <Empty msg="Agents only" />;

  const label = new Date(`${from}T12:00:00Z`).toLocaleString("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const taken = cells.size;
  const capacity = (chosen?.rooms.length ?? 0) * days.length;
  const mine = [...cells.values()].filter((c) => c.mine).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Calendar</h1>
        <p className="text-sm text-slate-500">
          Which nights are already gone, and which of them are yours.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => { setMonth(monthOf(month, -1)); setAnchor(null); }}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[10rem] text-center text-sm font-semibold text-slate-800">
              {label}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => { setMonth(monthOf(month, 1)); setAnchor(null); }}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {(data?.resorts.length ?? 0) > 1 && (
            <Select
              value={String(chosen?.resort.id ?? "")}
              onChange={(e) => setResortId(Number(e.target.value))}
              className="max-w-xs"
            >
              {data!.resorts.map((r) => (
                <option key={r.resort.id} value={r.resort.id}>
                  {r.resort.name}
                </option>
              ))}
            </Select>
          )}

          <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <i className="h-3 w-3 rounded-sm bg-brand-500" /> Yours
            </span>
            <span className="flex items-center gap-1">
              <i className="h-3 w-3 rounded-sm bg-slate-300" /> Taken
            </span>
            <span className="flex items-center gap-1">
              <i className="h-3 w-3 rounded-sm border border-slate-200 bg-white" /> Free
            </span>
            <span className="hidden sm:inline text-slate-400">
              Click a free night, then its last night, to take the whole stay.
            </span>
          </div>
        </div>
      </Card>

      {error && <ErrorState error={error as Error} />}
      {isLoading && !data && <Spinner label="Reading the month…" />}

      {data && data.resorts.length === 0 && (
        <Empty msg="You are not approved for any resort yet — request access from Discover resorts" />
      )}

      {chosen && (
        <Card className="!p-0" title={chosen.resort.name}>
          {chosen.resort.location && (
            <div className="flex items-center gap-1 px-4 pt-2 text-xs text-slate-500">
              <MapPin className="h-3 w-3" /> {chosen.resort.location}
            </div>
          )}
          <p className="px-4 pt-2 text-xs text-slate-500">
            <b>{capacity - taken}</b> free room-night{capacity - taken === 1 ? "" : "s"} this month
            {mine > 0 && (
              <>
                {" · "}
                <b>{mine}</b> yours
              </>
            )}
          </p>

          <div className="overflow-x-auto p-4">
            <table className="border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white pb-2 pr-3 text-left font-semibold text-slate-500">
                    Room
                  </th>
                  {/* The numbers alone gave no way to tell Thursday from
                      Tuesday, on a calendar whose whole job is which nights are
                      worth what. Thursday and Friday are the weekend here. */}
                  {days.map((d) => {
                    const day = iso(d);
                    const isToday = day === today;
                    const weekend = WEEKEND.has(d.getUTCDay());
                    return (
                      <th
                        key={day}
                        className={`w-7 pb-2 text-center font-medium tabular-nums ${
                          isToday ? "text-brand-700" : weekend ? "text-slate-500" : "text-slate-400"
                        }`}
                      >
                        <span
                          className={`block text-[10px] font-semibold uppercase ${
                            weekend ? "text-amber-600" : "text-slate-300"
                          }`}
                        >
                          {WEEKDAY_INITIALS[d.getUTCDay()]}
                        </span>
                        <span
                          className={
                            isToday
                              ? "mx-auto flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 font-bold text-white"
                              : ""
                          }
                        >
                          {d.getUTCDate()}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {chosen.rooms.map((room) => (
                  <tr key={room.id}>
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-white py-0.5 pr-3 font-medium text-slate-700">
                      {room.name}
                      {room.roomTypeName && (
                        <span className="ml-1 font-normal text-slate-400">{room.roomTypeName}</span>
                      )}
                    </td>
                    {days.map((d) => {
                      const cell = cells.get(`${room.id}|${iso(d)}`);
                      const title = !cell
                        ? `${room.name} free on ${iso(d)}`
                        : cell.mine
                          ? `Yours — ${cell.guestName ?? ""} ${cell.code ?? ""}`.trim()
                          : cell.guestName
                            ? `Taken — ${cell.guestName}`
                            : "Taken";
                      // a free night is the offer an agent is looking for, so
                      // it is the thing you click: the form opens with this
                      // resort, this room and this date already filled in
                      if (!cell) {
                        const night = iso(d);
                        const isAnchor = anchor?.roomId === room.id && anchor.night === night;
                        // once a night is marked, the nights the stay could
                        // still reach are tinted — so how far the run of free
                        // nights goes is visible before the second click
                        const reachable =
                          !isAnchor &&
                          anchor?.roomId === room.id &&
                          freeSpan(cells, room.id, anchor.night, night) !== null;
                        const weekend = WEEKEND.has(d.getUTCDay());
                        return (
                          <td key={night} className="p-[1px]">
                            <button
                              type="button"
                              onClick={() => pickNight(room.id, night)}
                              title={
                                anchor?.roomId === room.id
                                  ? `${room.name}: ${anchor.night} → ${night}`
                                  : `${room.name} free on ${night} — click, then the last night`
                              }
                              className={`block h-6 w-full rounded-sm border transition ${
                                isAnchor
                                  ? "border-brand-500 bg-brand-200"
                                  : reachable
                                    ? "border-brand-300 bg-brand-50"
                                    : weekend
                                      ? "border-amber-100 bg-amber-50/40 hover:border-brand-400 hover:bg-brand-50"
                                      : "border-slate-200 bg-white hover:border-brand-400 hover:bg-brand-50"
                              }`}
                            />
                          </td>
                        );
                      }
                      return (
                        <td key={iso(d)} className="p-[1px]">
                          <div
                            title={title}
                            className={`h-6 rounded-sm ${cell.mine ? "bg-brand-500" : "bg-slate-300"}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-100 px-4 py-3">
            <Link
              href={`/bookings?resortId=${chosen.resort.id}`}
              className="text-xs font-semibold text-brand-700 hover:underline"
            >
              All bookings at {chosen.resort.name} →
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
