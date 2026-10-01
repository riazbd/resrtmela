"use client";

import Link from "next/link";
import { Table } from "@/components/patterns";
import { client, money, dmy, type TodayRow } from "@/lib/api";
import { useApi, keys } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import { Badge, Card, Empty, Spinner, Td, Th } from "@/components/ui";
import { ErrorState, Skeleton } from "@/components/error-state";
import { AreaChart, Donut, Legend } from "@/components/charts";
import { Hero, HeroFigure, greetingAt } from "@/components/hero";
import { MONEY_TONE, addDaysIso, todayIn } from "@rh/shared";

export default function DashboardPage() {
  const { activeResort, isStaff, can, me } = useAuth();
  const enabled = !!activeResort;
  const today = todayIn(activeResort?.timezone);
  const monthAgo = addDaysIso(today, -29);
  // the last thirty days, as a picture: the same daily report the Reports
  // page lists, so the two cannot disagree
  const trendQ = useApi(
    keys.reports(activeResort?.id, "daily", `${monthAgo}:${today}`),
    () => client.reports.daily(activeResort!.id, monthAgo, addDaysIso(today, 1)),
    { enabled: enabled && isStaff && can("reports.view") },
  );
  // three independent reads, three cache entries: the room list is the same
  // one the Rooms page just fetched, and it is not fetched again
  const todayQ = useApi(keys.today(activeResort?.id), () => client.today(activeResort!.id), { enabled });
  const roomsQ = useApi(keys.rooms(activeResort?.id), () => client.rooms.list(activeResort!.id), { enabled });
  const duesQ = useApi(keys.dues(activeResort?.id), () => client.dues(activeResort!.id), {
    enabled: enabled && isStaff,
  });

  const feed = todayQ.data;
  const roomCount = roomsQ.data?.length ?? null;
  const dues = duesQ.data ?? null;

  const error = todayQ.error ?? roomsQ.error;
  if (error) return <ErrorState error={error} />;
  if (todayQ.isPending || !feed) return <Skeleton rows={6} />;

  const person = (b: TodayRow) => b.guest?.fullName ?? "—";

  // the resort's hour, so a 9pm visit from a laptop abroad is still "evening" at the resort
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: activeResort?.timezone ?? "Asia/Dhaka" }).format(new Date()),
  );
  const longDay = new Date(`${today}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  return (
    <div className="space-y-6">
      <Hero
        title={`${greetingAt(hour)}, ${(me?.name ?? "").split(" ")[0] || "there"}`}
        subtitle={`${activeResort?.name ?? ""} · ${longDay}`}
      >
        <HeroFigure label="Occupied tonight" value={`${feed.occupancyPct}%`} />
        <HeroFigure label="Arriving" value={String(feed.arrivals.length)} hint="today" />
        <HeroFigure label="Leaving" value={String(feed.departures.length)} hint="today" />
        {dues && (
          <HeroFigure
            label="Outstanding dues"
            value={money(dues.total)}
            /* how much of it the desk can actually ask for. The rest is an
               agency settlement, and reading one number for both sends
               somebody to chase a guest for money the guest does not owe. */
            hint={
              dues.agencyTotal > 0
                ? `${dues.count} booking(s) · ${money(dues.agencyTotal)} from agencies`
                : `${dues.count} booking(s)`
            }
          />
        )}
      </Hero>

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

      {(trendQ.data?.length ?? 0) > 0 && (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card
            title="The last 30 days"
            action={
              <Link href="/reports" className="text-xs text-brand-600 hover:underline">
                Reports →
              </Link>
            }
          >
            <Legend
              className="mb-2"
              items={[
                { label: "Rooms", color: MONEY_TONE.paid.solid, value: money(trendQ.data!.reduce((s, d) => s + d.roomRevenue, 0)) },
                { label: "Restaurant", color: MONEY_TONE.advance.solid, value: money(trendQ.data!.reduce((s, d) => s + d.fbRevenue, 0)) },
                { label: "Expenses", color: MONEY_TONE.expense.solid, value: money(trendQ.data!.reduce((s, d) => s + d.expenses, 0)) },
              ]}
            />
            <AreaChart
              height={200}
              formatFull={money}
              data={trendQ.data!.map((d) => ({
                label: new Date(`${d.date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
                title: d.date,
                values: { rooms: d.roomRevenue, fb: d.fbRevenue, expenses: d.expenses },
              }))}
              series={[
                { key: "rooms", label: "Rooms", color: MONEY_TONE.paid.solid },
                { key: "fb", label: "Restaurant", color: MONEY_TONE.advance.solid },
                { key: "expenses", label: "Expenses", color: MONEY_TONE.expense.solid },
              ]}
            />
          </Card>
          <Card title="Tonight">
            <Donut
              format={(n) => String(Math.round(n))}
              center={{ value: `${feed.occupancyPct}%`, label: "occupied" }}
              parts={[
                { label: "Occupied", value: feed.occupancyPct, color: MONEY_TONE.paid.solid },
                { label: "Free", value: Math.max(0, 100 - feed.occupancyPct), color: "#e2e8f0" },
              ]}
            />
            <p className="mt-3 text-xs text-slate-400">
              {feed.arrivals.length} arriving and {feed.departures.length} leaving today.
            </p>
          </Card>
        </div>
      )}

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
            <Table minWidth={0}>
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
                    <Td className="text-right font-medium">{money(b.due)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title={`Departures — ${dmy(new Date())}`}>
          {feed.departures.length === 0 ? (
            <Empty msg="No departures today" />
          ) : (
            <Table minWidth={0}>
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
                    <Td className="text-right font-medium">{money(b.due)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
