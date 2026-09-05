"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, bdt, dmy, type BookingRow, type Room } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Card, Empty, Spinner, Stat, Td, Th } from "@/components/ui";

interface TodayFeed {
  arrivals: BookingRow[];
  departures: BookingRow[];
  occupancyPct: number;
  duesTotal: number;
  duesCount: number;
}

interface Dues {
  total: number;
  count: number;
}

export default function DashboardPage() {
  const { activeResort, isStaff } = useAuth();
  const [feed, setFeed] = useState<TodayFeed | null>(null);
  const [dues, setDues] = useState<Dues | null>(null);
  const [roomCount, setRoomCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeResort) return;
    let alive = true;
    setLoading(true);
    Promise.all([
      api<TodayFeed>(`/resorts/${activeResort.id}/today`),
      api<Room[]>(`/resorts/${activeResort.id}/rooms`),
      isStaff ? api<Dues>(`/resorts/${activeResort.id}/dues`) : Promise.resolve(null),
    ])
      .then(([f, roomsList, d]) => {
        if (!alive) return;
        setFeed(f);
        setRoomCount(roomsList.length);
        if (d) setDues({ total: d.total, count: d.count });
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [activeResort, isStaff]);

  if (loading || !feed) return <Spinner />;

  const person = (b: BookingRow) => b.guest?.fullName ?? "—";

  return (
    <div className="space-y-6">
      {roomCount === 0 && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
          <div className="text-sm font-semibold text-brand-900">
            Welcome to Resort Mela — set up in 2 steps
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href="/rooms"
              className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700"
            >
              1. Add your rooms
            </a>
            <a
              href="/import"
              className="rounded-lg border border-brand-300 bg-white px-3 py-2 text-xs font-medium text-brand-700 hover:bg-brand-100"
            >
              or 2. Import your existing sheet (CSV)
            </a>
          </div>
          <p className="mt-2 text-[11px] text-brand-700/70">
            Importing auto-creates rooms from your sheet and preserves your BK-codes.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Occupancy today" value={`${feed.occupancyPct}%`} sub="checked-in rooms" />
        <Stat label="Arrivals" value={String(feed.arrivals.length)} sub="expected today" tone="green" />
        <Stat label="Departures" value={String(feed.departures.length)} sub="due out today" />
        {dues && (
          <Stat
            label="Outstanding dues"
            value={bdt(dues.total)}
            sub={`${dues.count} booking(s)`}
            tone="red"
          />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title={`Arrivals — ${dmy(new Date())}`}
          action={
            <Link href="/bookings" className="text-xs text-brand-600 hover:underline">
              All bookings →
            </Link>
          }
        >
          {feed.arrivals.length === 0 ? (
            <Empty msg="No arrivals today" />
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Guest</Th>
                  <Th>Rooms</Th>
                  <Th>State</Th>
                  <Th className="text-right">Due</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {feed.arrivals.map((b) => (
                  <tr key={b.id}>
                    <Td>
                      <div className="font-medium">{person(b)}</div>
                      <div className="text-[11px] text-slate-400">{b.code}</div>
                    </Td>
                    <Td className="text-xs">{b.rooms.join(", ")}</Td>
                    <Td>
                      <Badge value={b.state} />
                    </Td>
                    <Td className="text-right font-medium">{bdt(b.due)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title={`Departures — ${dmy(new Date())}`}>
          {feed.departures.length === 0 ? (
            <Empty msg="No departures today" />
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Guest</Th>
                  <Th>Rooms</Th>
                  <Th>State</Th>
                  <Th className="text-right">Due</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {feed.departures.map((b) => (
                  <tr key={b.id}>
                    <Td>
                      <div className="font-medium">{person(b)}</div>
                      <div className="text-[11px] text-slate-400">{b.code}</div>
                    </Td>
                    <Td className="text-xs">{b.rooms.join(", ")}</Td>
                    <Td>
                      <Badge value={b.state} />
                    </Td>
                    <Td className="text-right font-medium">{bdt(b.due)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
