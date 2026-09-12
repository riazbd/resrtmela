"use client";

import { useMemo, useState } from "react";
import { Table } from "@/components/patterns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, money } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, keys } from "@/lib/query";
import { Button, Card, Empty, Select, Spinner } from "@/components/ui";
import { ErrorState } from "@/components/error-state";
import { MapPin } from "lucide-react";
import { occupancyCells, freeSpan, type CalendarCell } from "@/lib/agency-calendar";
import { mergeRuns } from "@/lib/calendar-bars";
import { todayIn, addDaysIso } from "@/lib/resort-dates";
import { monthOf, monthStart, monthLength, isWeekend, startsTheWeek } from "@/lib/calendar-month";
import { MonthAvailability } from "@/components/month-availability";
import type { AgencyCalendar } from "@rh/shared";

/**
 * The month, for an agency — the same working screen the resort's own desk has.
 *
 * "Have you got anything for the 12th" is answered by the room search. This
 * answers the question that comes next — "what does November look like" — which
 * an agent planning a group has to see rather than ask about one date at a
 * time.
 *
 * It used to be a read-only picture: a whole calendar month at a time, every
 * taken night the same flat colour, and no way to reach a booking from it. The
 * resort's calendar is none of those things — it opens on today and slides, it
 * says how full each night is before you read a single row, a stay is coloured
 * by where it has got to and striped when the money has not come in, and
 * clicking it opens it. An agency is entitled to all of that for the bookings
 * it sold, and this screen now gives it.
 *
 * What does not cross over is identity. A night someone else sold is a grey
 * block and nothing more: no name, no code, no state, no money, not even which
 * agency. The resort down the road sells to the same agencies, and a calendar
 * with names on it is a customer list with a date attached. There is no setting
 * that opens this: one existed and was removed, because it named the guest on
 * every stay rather than only the resort's own.
 */

/**
 * The four states that hold a room, coloured as the resort's calendar colours
 * them. An agent reading both screens in one afternoon should not have to learn
 * two vocabularies for the same fact.
 */
const BAR: Record<string, { fill: string; text: string; label: string }> = {
  PENDING: { fill: "bg-amber-400", text: "text-amber-950", label: "Pending" },
  CONFIRMED: { fill: "bg-emerald-500", text: "text-white", label: "Confirmed" },
  CHECKED_IN: { fill: "bg-sky-600", text: "text-white", label: "In house" },
  CHECKED_OUT: { fill: "bg-slate-300", text: "text-slate-700", label: "Departed" },
};

/** What is still owed, as a stripe under the bar rather than a fifth colour. */
const DUE_STRIPE: Record<string, string> = {
  UNPAID: "bg-red-500",
  PARTIAL: "bg-amber-500",
};

const SPANS = [7, 14, 30] as const;

const dayNumber = (day: string) => Number(day.slice(8, 10));
const monthLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
/** A hairline where the week turns over, so the eye has somewhere to land. */
const weekEdge = (day: string) => (startsTheWeek(day) ? "border-l border-l-slate-300" : "");

export default function AgencyCalendarPage() {
  const router = useRouter();
  const { role, activeResort } = useAuth();
  // the resort's today, not the browser's: from 18:00 in Dhaka they differ, and
  // a calendar that opens on tomorrow is a calendar nobody trusts
  const today = todayIn(activeResort?.timezone);
  const [start, setStart] = useState(today);
  // a month, not a fortnight: an agent is looking for dates, and two screens
  // of paging to see one month was the tax on every search
  const [span, setSpan] = useState<number>(30);
  const [resortId, setResortId] = useState<number | null>(null);
  const [view, setView] = useState<"rooms" | "month">("rooms");
  /** The first night of a stay being picked out, waiting for its second click. */
  const [anchor, setAnchor] = useState<{ roomId: number; night: string } | null>(null);

  const days = useMemo(
    () => Array.from({ length: span }, (_, i) => addDaysIso(start, i)),
    [start, span],
  );
  const end = addDaysIso(start, span);

  const { data, isLoading, error } = useApi<AgencyCalendar>(
    keys.agentCalendar(start, end),
    () => api<AgencyCalendar>(`/agent/calendar?from=${start}&to=${end}`),
    { placeholderData: (prev) => prev },
  );

  const chosen = useMemo(() => {
    const list = data?.resorts ?? [];
    if (list.length === 0) return null;
    return list.find((r) => r.resort.id === resortId) ?? list[0]!;
  }, [data, resortId]);

  // one lookup per room-night, built once; the checkout-morning rule that
  // decides what a square means lives in `lib/agency-calendar` with its tests
  const cells = useMemo(() => occupancyCells(chosen?.stays ?? []), [chosen]);

  /**
   * What can be sold comes first; a room out of service sinks to the bottom,
   * still visible. An agent reads this for the nights they can sell, and four
   * rows of hatching interleaved between sellable rooms is in the way of the
   * answer.
   */
  const sellable = useMemo(
    () => (chosen?.rooms ?? []).filter((r) => r.status === "ACTIVE"),
    [chosen],
  );
  const rooms = useMemo(
    () => [...sellable, ...(chosen?.rooms ?? []).filter((r) => r.status !== "ACTIVE")],
    [chosen, sellable],
  );

  /** How full each night is — the strip that answers "how are we doing" at a glance. */
  const occupancy = useMemo(
    () =>
      days.map((day) => ({
        day,
        taken: sellable.reduce((n, r) => n + (cells.has(`${r.id}|${day}`) ? 1 : 0), 0),
      })),
    [days, sellable, cells],
  );

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
    const picked = freeSpan(cells, roomId, anchor.night, night);
    if (!picked) {
      setAnchor({ roomId, night });
      return;
    }
    setAnchor(null);
    router.push(
      `/bookings?resortId=${chosen.resort.id}&roomId=${roomId}&checkIn=${picked.from}&checkOut=${picked.to}&new=1`,
    );
  }

  if (role !== "AGENT") return <Empty msg="Agents only" />;

  const taken = cells.size;
  const capacity = sellable.length * days.length;
  const mine = [...cells.values()].filter((c) => c.mine).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Calendar</h1>
        <p className="text-sm text-slate-500">
          Which nights are already gone, which of them are yours, and what is still due on them.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setStart(addDaysIso(start, -span)); setAnchor(null); }}
            >
              ←
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setStart(today); setAnchor(null); }}>
              Today
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setStart(addDaysIso(start, span)); setAnchor(null); }}
            >
              →
            </Button>
          </div>
          {/* jump to a month, rather than paging to it a span at a time */}
          <input
            type="month"
            aria-label="Go to month"
            value={monthOf(start)}
            onChange={(e) => {
              const first = monthStart(e.target.value);
              if (!first) return;
              setStart(first);
              setSpan(monthLength(e.target.value));
              setAnchor(null);
            }}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700"
          />
          <span className="text-sm font-semibold text-slate-700">
            {dayNumber(start)} {monthLabel(start)} – {dayNumber(addDaysIso(end, -1))}{" "}
            {monthLabel(addDaysIso(end, -1))}
          </span>
          <div className="ml-1 flex overflow-hidden rounded-lg border border-slate-200">
            {SPANS.map((n) => (
              <button
                key={n}
                onClick={() => { setSpan(n); setAnchor(null); }}
                className={`px-2.5 py-1 text-xs font-semibold transition ${
                  span === n ? "bg-brand-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                {n}d
              </button>
            ))}
          </div>
          {/* the same two questions an agent has: who is where, and whether
              the 22nd has anything left at all */}
          <div className="ml-1 flex overflow-hidden rounded-lg border border-slate-200">
            {(["rooms", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => {
                  // the month view reads the same occupancy the grid does, so
                  // the range has to be the month or the days outside it read
                  // as empty rather than as unknown
                  if (v === "month") {
                    const first = monthStart(monthOf(start));
                    if (first) {
                      setStart(first);
                      setSpan(monthLength(monthOf(start)));
                    }
                  }
                  setView(v);
                  setAnchor(null);
                }}
                className={`px-2.5 py-1 text-xs font-semibold capitalize transition ${
                  view === v ? "bg-brand-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {(data?.resorts.length ?? 0) > 1 && (
            <Select
              value={String(chosen?.resort.id ?? "")}
              onChange={(e) => { setResortId(Number(e.target.value)); setAnchor(null); }}
              className="max-w-xs"
            >
              {data!.resorts.map((r) => (
                <option key={r.resort.id} value={r.resort.id}>
                  {r.resort.name}
                </option>
              ))}
            </Select>
          )}
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
            Payment due
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="h-2.5 w-4 rounded-sm bg-slate-300" />
            Sold by someone else
          </span>
        </div>
      </div>

      {error && <ErrorState error={error as Error} />}
      {isLoading && !data && <Spinner label="Reading the month…" />}

      {data && data.resorts.length === 0 && (
        <Empty msg="You are not approved for any resort yet — request access from Discover resorts" />
      )}

      {chosen && (
        <Card className="overflow-hidden !p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
            <div>
              <div className="text-sm font-semibold text-slate-800">{chosen.resort.name}</div>
              {chosen.resort.location && (
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <MapPin className="h-3 w-3" /> {chosen.resort.location}
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500">
              <b>{capacity - taken}</b> free room-night{capacity - taken === 1 ? "" : "s"} here
              {mine > 0 && (
                <>
                  {" · "}
                  <b>{mine}</b> yours
                </>
              )}
              <span className="ml-2 hidden text-slate-400 sm:inline">
                Click a free night, then its last night, to take the whole stay.
              </span>
            </p>
          </div>

          {rooms.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">This resort has no rooms on sale.</p>
          ) : view === "month" ? (
            <div className="p-4">
              <MonthAvailability
                month={monthOf(start)}
                sellable={sellable.length}
                load={occupancy}
                today={today}
                onPick={(day) => { setStart(day); setSpan(7); setView("rooms"); }}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* `table-fixed` with a width only on the room column: the surplus
                  is then shared equally between the day columns, so a bar
                  spanning four of them cannot pull the body out of step with
                  its own header. */}
              <Table minWidth={860} tableClassName="table-fixed border-collapse">
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
                      const weekend = isWeekend(day);
                      return (
                        <th
                          key={day}
                          className={`border-b border-slate-200 px-1 py-1.5 text-center ${weekEdge(day)} ${
                            isToday ? "bg-brand-50" : ""
                          }`}
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
                    {occupancy.map(({ day, taken: n }) => {
                      const share = sellable.length ? n / sellable.length : 0;
                      return (
                        <td
                          key={day}
                          title={`${n} of ${sellable.length} sellable rooms taken on ${day}`}
                          className={`border-b border-slate-200 px-1 pb-1.5 text-center text-[10px] font-bold tabular-nums ${weekEdge(day)} ${
                            share === 0
                              ? "text-slate-300"
                              : share < 0.5
                                ? "text-slate-500"
                                : share < 0.9
                                  ? "text-amber-600"
                                  : "text-emerald-700"
                          }`}
                        >
                          {n}
                        </td>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {rooms.map((room) => {
                    if (room.status !== "ACTIVE") {
                      return (
                        <tr key={room.id} className="group">
                          <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-1.5 group-hover:bg-slate-50">
                            <div className="text-sm font-medium text-slate-400 line-through">
                              {room.name}
                            </div>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              Out of service
                            </div>
                          </td>
                          <td colSpan={days.length} className="border-b border-slate-100 p-0.5">
                            <div
                              title={`${room.name} is out of service — the resort cannot sell it`}
                              className="h-9 rounded-md bg-[repeating-linear-gradient(45deg,#f8fafc,#f8fafc_6px,#eef2f7_6px,#eef2f7_12px)]"
                            />
                          </td>
                        </tr>
                      );
                    }
                    /**
                     * One bar per stay, not one square per night.
                     *
                     * A three-night booking used to be three disconnected
                     * blocks, so the eye had to reassemble a stay out of a
                     * mosaic. Free nights stay individual squares on purpose:
                     * each one is a thing to click, and the pair of clicks is
                     * how a span is chosen.
                     */
                    const runs = mergeRuns(
                      days,
                      (day) => cells.get(`${room.id}|${day}`) ?? null,
                      (c) => `${c.mine}|${c.bookingId ?? c.code ?? c.guestName ?? "x"}`,
                    );
                    return (
                      <tr key={room.id} className="group">
                        <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-1.5 group-hover:bg-slate-50">
                          <div className="truncate text-sm font-medium text-slate-700">
                            {room.name}
                          </div>
                          <div className="truncate text-[10px] text-slate-400">
                            {room.roomTypeName ?? ""}
                            {/* the rate is the resort's to share; it is absent
                                where the resort keeps its pricing to itself */}
                            {room.roomTypeName && room.baseRate != null ? " · " : ""}
                            {room.baseRate != null ? money(room.baseRate) : ""}
                          </div>
                        </td>

                        {runs.map((run) =>
                          run.value ? (
                            <StayBar
                              key={run.from}
                              cell={run.value}
                              nights={run.nights}
                              edge={weekEdge(run.from)}
                              onOpen={(id) => router.push(`/bookings?id=${id}`)}
                            />
                          ) : (
                            <FreeNights
                              key={run.from}
                              room={room}
                              from={run.from}
                              nights={run.nights}
                              anchor={anchor}
                              cells={cells}
                              onPick={pickNight}
                            />
                          ),
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}

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

/**
 * One occupied span.
 *
 * The agency's own stay is the resort's own bar: coloured by state, striped
 * when money is owed, and a button that opens the booking. Somebody else's is
 * a calm grey band that does nothing, because there is nothing here the agency
 * may act on and nothing it may read. The API sends no name for it, and there
 * is no setting that makes it send one — so there is no branch here for the
 * case where one arrives.
 */
function StayBar({
  cell,
  nights,
  edge,
  onOpen,
}: {
  cell: CalendarCell;
  nights: number;
  edge: string;
  onOpen: (bookingId: number) => void;
}) {
  if (!cell.mine) {
    return (
      <td colSpan={nights} className={`border-b border-slate-100 p-0.5 ${edge}`}>
        <div
          title="Taken — sold by someone else"
          className="h-9 overflow-hidden rounded-md bg-slate-300/90 ring-1 ring-inset ring-slate-400/30"
        />
      </td>
    );
  }

  const look = BAR[cell.state] ?? BAR.CONFIRMED!;
  const stripe = cell.paymentState ? DUE_STRIPE[cell.paymentState] : undefined;
  return (
    <td colSpan={nights} className={`border-b border-slate-100 p-0.5 ${edge}`}>
      <button
        onClick={() => cell.bookingId != null && onOpen(cell.bookingId)}
        title={`${cell.code ?? ""} ${cell.guestName ?? ""} · ${look.label}${stripe ? " · payment due" : ""}`.trim()}
        className={`relative flex h-9 w-full items-center overflow-hidden px-2 text-left transition hover:brightness-110 ${look.fill} ${look.text} rounded-md`}
      >
        <span className="truncate text-[11px] font-semibold leading-none">
          {cell.guestName ?? cell.code}
        </span>
        {nights > 2 && cell.guestName && cell.code && (
          <span className="ml-1.5 truncate text-[10px] font-medium leading-none opacity-70">
            {cell.code}
          </span>
        )}
        {stripe && <span className={`absolute inset-x-0 bottom-0 h-1 ${stripe}`} aria-hidden />}
      </button>
    </td>
  );
}

/**
 * A run of free nights, still one clickable square each.
 *
 * Taken nights merge into a bar because they are one fact. Free nights do not:
 * each one is a thing the agent can pick, and picking two of them is how a stay
 * is chosen. What the run buys is the tinting — once the first night is marked,
 * every night the stay could still reach lights up, so how far the free stretch
 * goes is visible before the second click.
 */
function FreeNights({
  room,
  from,
  nights,
  anchor,
  cells,
  onPick,
}: {
  room: { id: number; name: string };
  from: string;
  nights: number;
  anchor: { roomId: number; night: string } | null;
  cells: Map<string, CalendarCell>;
  onPick: (roomId: number, night: string) => void;
}) {
  return (
    <>
      {Array.from({ length: nights }, (_, i) => {
        const night = addDaysIso(from, i);
        const isAnchor = anchor?.roomId === room.id && anchor.night === night;
        const reachable =
          !isAnchor &&
          anchor?.roomId === room.id &&
          freeSpan(cells, room.id, anchor.night, night) !== null;
        return (
          <td
            key={night}
            /* The weekend is marked in the header and nowhere else. Tinting
               the cell as well left amber slivers around every button, which
               is noise rather than information — the same mistake the resort
               calendar made and had removed. */
            className={`border-b border-slate-100 p-0.5 ${weekEdge(night)}`}
          >
            <button
              type="button"
              onClick={() => onPick(room.id, night)}
              title={
                anchor?.roomId === room.id
                  ? `${room.name}: ${anchor.night} → ${night}`
                  : `${room.name} free on ${night} — click, then the last night`
              }
              className={`block h-9 w-full rounded transition ${
                isAnchor
                  ? "bg-brand-400 ring-1 ring-inset ring-brand-600"
                  : reachable
                    ? "bg-brand-200 ring-1 ring-inset ring-brand-400"
                    : // a free night is inventory, not a gap: `bg-slate-50` was
                      // the page's own background, so an empty row read as a
                      // hole in the table. The resting tint is the hover colour,
                      // quieter, and hovering deepens it
                      "bg-brand-50 ring-1 ring-inset ring-brand-100 hover:bg-brand-100 hover:ring-brand-400"
              }`}
            />
          </td>
        );
      })}
    </>
  );
}
