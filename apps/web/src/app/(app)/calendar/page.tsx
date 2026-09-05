"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, iso, type CalendarBooking, type Room } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Card, Spinner } from "@/components/ui";

const CELL_COLORS: Record<string, string> = {
  CONFIRMED: "bg-green-500/90",
  PENDING: "bg-amber-400/90",
  CHECKED_IN: "bg-blue-500/90",
  CHECKED_OUT: "bg-slate-400/70",
  CANCELLED: "bg-red-500/90",
  NO_SHOW: "bg-yellow-900/80",
};

const LEGEND = [
  ["CONFIRMED", "Confirmed"],
  ["PENDING", "Pending"],
  ["CHECKED_IN", "Checked-in"],
  ["CHECKED_OUT", "Checked-out"],
  ["CANCELLED", "Cancelled"],
  ["NO_SHOW", "No Show"],
] as const;

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export default function CalendarPage() {
  const { activeResort } = useAuth();
  const router = useRouter();
  const [start, setStart] = useState<Date>(() => new Date());
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<CalendarBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const days = 14;

  const end = useMemo(() => addDays(start, days), [start]);
  const dayList = useMemo(
    () => Array.from({ length: days }, (_, i) => addDays(start, i)),
    [start],
  );

  const load = useCallback(async () => {
    if (!activeResort) return;
    setLoading(true);
    try {
      const [roomList, cal] = await Promise.all([
        api<Room[]>(`/resorts/${activeResort.id}/rooms`),
        api<{ bookings: CalendarBooking[] }>(
          `/resorts/${activeResort.id}/calendar?from=${iso(start)}&to=${iso(end)}`,
        ),
      ]);
      setRooms(roomList.filter((r) => r.status === "ACTIVE"));
      setBookings(cal.bookings);
    } finally {
      setLoading(false);
    }
  }, [activeResort, start, end]);

  useEffect(() => {
    void load();
  }, [load]);

  // roomId:date -> booking
  const cellMap = useMemo(() => {
    const map = new Map<string, CalendarBooking>();
    for (const b of bookings) {
      const ci = new Date(b.checkIn);
      const co = new Date(b.checkOut);
      for (const d of dayList) {
        if (d >= ci && d < co) {
          for (const r of b.rooms) {
            if (r.id !== null) map.set(`${r.id}:${iso(d)}`, b);
          }
        }
      }
    }
    return map;
  }, [bookings, dayList]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setStart((s) => addDays(s, -7))}>
            ← Prev
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setStart(new Date())}>
            Today
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setStart((s) => addDays(s, 7))}>
            Next →
          </Button>
          <span className="ml-2 text-sm font-medium text-slate-600">
            {start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} –{" "}
            {end.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {LEGEND.map(([state, label]) => (
            <span key={state} className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className={`h-2.5 w-2.5 rounded ${CELL_COLORS[state]}`} />
              {label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="h-2.5 w-2.5 rounded bg-orange-400/90" />Partial payment
          </span>
        </div>
      </div>

      <Card className="overflow-hidden !p-0">
        {loading ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[130px] border-b border-r border-slate-200 bg-white px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Room
                  </th>
                  {dayList.map((d) => {
                    const isToday = iso(d) === iso(new Date());
                    return (
                      <th
                        key={iso(d)}
                        className={`border-b border-slate-200 px-1 py-1.5 text-center text-[10px] font-medium ${
                          isToday ? "bg-brand-50 text-brand-700" : "text-slate-400"
                        }`}
                      >
                        <div>{d.toLocaleDateString("en-GB", { weekday: "narrow" })}</div>
                        <div className="text-sm font-semibold">{d.getDate()}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => (
                  <tr key={room.id} className="hover:bg-slate-50/50">
                    <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-1.5">
                      <div className="text-sm font-medium text-slate-700">{room.name}</div>
                      <div className="text-[10px] text-slate-400">
                        ৳{Number(room.baseRate).toLocaleString("en-IN")}
                      </div>
                    </td>
                    {dayList.map((d) => {
                      const b = cellMap.get(`${room.id}:${iso(d)}`);
                      const color = b
                        ? CELL_COLORS[b.state] ?? "bg-slate-300"
                        : "";
                      const isCheckout = b ? iso(new Date(b.checkOut)) === iso(d) : false;
                      return (
                        <td key={iso(d)} className="border-b border-slate-100 p-0.5">
                          {b ? (
                            <button
                              title={`${b.code} · ${b.guestName}${b.agentName ? ` (agent: ${b.agentName})` : ""}`}
                              onClick={() => router.push(`/bookings?id=${b.id}`)}
                              className={`h-8 w-full min-w-[34px] rounded ${color} text-white transition hover:opacity-80 ${
                                isCheckout ? "rounded-r-none" : ""
                              }`}
                            >
                              <span className="block truncate px-1 text-[9px] font-semibold leading-8">
                                {b.guestName.split(" ")[0]}
                              </span>
                            </button>
                          ) : (
                            <div className="h-8 min-w-[34px] rounded bg-slate-50" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
