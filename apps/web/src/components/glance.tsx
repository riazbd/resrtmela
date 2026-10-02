"use client";

/**
 * The figures and shares above a list — bookings, guests, rooms. The sums are
 * `@rh/shared`'s `bookingsGlance` / `guestsGlance`, which the app draws from too.
 */
import { BedDouble, Brush, CalendarCheck, HandCoins, Sparkles, Wallet } from "lucide-react";
import {
  HOUSEKEEPING_TONE,
  MONEY_TONE,
  bookingsGlance,
  compactNumber,
  guestsGlance,
  housekeepingLabel,
  nextHousekeepingState,
  roomsGlance,
  type BookingRow,
  type GuestRow,
  type HousekeepingRow,
  type Room,
} from "@rh/shared";
import { money } from "@/lib/api";
import { Card } from "@/components/ui";
import { BarList, Donut, KpiCard, Meter } from "@/components/charts";

export function BookingsGlance({ rows, total, sourceLabel }: { rows: BookingRow[]; total: number; sourceLabel?: (code: string) => string }) {
  if (rows.length === 0) return null;
  const g = bookingsGlance(rows, sourceLabel);
  const scope = total > rows.length ? `The ${rows.length} newest of ${total} that match` : `All ${rows.length} that match`;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Bookings" value={String(g.count)} sub={scope} tone={MONEY_TONE.advance.solid} icon={<CalendarCheck className="h-4 w-4" />} />
        <KpiCard label="Nights sold" value={String(g.nights)} sub="Not counting cancelled or no-show" tone={MONEY_TONE.income.solid} icon={<BedDouble className="h-4 w-4" />} />
        <KpiCard label="Collected" value={money(g.paid)} tone={MONEY_TONE.paid.solid} icon={<HandCoins className="h-4 w-4" />} />
        <KpiCard label="Still due" value={money(g.due)} tone={g.due > 0 ? MONEY_TONE.late.solid : MONEY_TONE.neutral.solid} icon={<Wallet className="h-4 w-4" />} />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Card title="Where they stand">
          <Donut format={(n) => String(n)} center={{ value: String(g.count), label: "bookings" }} parts={g.byState} size={140} />
        </Card>
        <Card title="How much is paid">
          <div className="pt-2">
            <Meter format={(n) => String(n)} parts={g.byPayment} height={18} />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {money(g.paid)} in, {money(g.due)} to come — {compactNumber(g.paid + g.due ? (g.paid / (g.paid + g.due)) * 100 : 0)}% collected
          </p>
        </Card>
        <Card title="Where they came from">
          <BarList format={(n) => String(n)} rows={g.bySource.map((s) => ({ label: s.label, value: s.value, color: s.color }))} limit={6} />
        </Card>
      </div>
    </div>
  );
}

export function GuestsGlance({ rows, total }: { rows: GuestRow[]; total: number }) {
  if (rows.length === 0) return null;
  const g = guestsGlance(rows.map((r) => ({ bookings: r.bookingCount })));
  const top = [...rows].sort((a, b) => b.bookingCount - a.bookingCount).slice(0, 6);
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card title="Who comes back">
        <Donut format={(n) => String(n)} center={{ value: String(g.returning), label: "returning" }} parts={g.loyalty} size={140} />
        <p className="mt-2 text-xs text-slate-500">{total > rows.length ? `Of the ${rows.length} on this page (${total} guests in all)` : `Of all ${rows.length} guests`}</p>
      </Card>
      <Card title="Most stays" className="lg:col-span-2">
        <BarList format={(n) => `${n} stay${n === 1 ? "" : "s"}`} color={MONEY_TONE.paid.solid} rows={top.map((r) => ({ label: r.fullName, sub: r.phone, value: r.bookingCount }))} />
      </Card>
    </div>
  );
}

export function RoomsGlance({ rooms }: { rooms: Room[] }) {
  if (rooms.length === 0) return null;
  const g = roomsGlance(rooms);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Rooms" value={String(g.count)} sub={`${g.onSale} on sale · ${g.outOfService} out of service`} tone={MONEY_TONE.paid.solid} icon={<BedDouble className="h-4 w-4" />} />
        <KpiCard label="Lowest rate" value={money(g.lowest)} tone={MONEY_TONE.advance.solid} icon={<Wallet className="h-4 w-4" />} />
        <KpiCard label="Average rate" value={money(g.average)} tone={MONEY_TONE.income.solid} icon={<Wallet className="h-4 w-4" />} />
        <KpiCard label="Highest rate" value={money(g.highest)} tone={MONEY_TONE.bonus.solid} icon={<Wallet className="h-4 w-4" />} />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Card title="On sale">
          <Donut format={(n) => String(n)} center={{ value: String(g.onSale), label: "selling" }} parts={g.sale} size={140} />
        </Card>
        <Card title="Rooms by type" className="lg:col-span-2">
          <BarList format={(n) => `${n} room${n === 1 ? "" : "s"}`} rows={g.byType.map((t) => ({ label: t.label, sub: `${money(t.average)} a night on average`, value: t.value, color: t.color }))} />
        </Card>
      </div>
    </div>
  );
}

/**
 * Every room as a tile, coloured by where housekeeping has it — the floor at a
 * glance. A tile is pressed to move the room on, the same act as the row's button.
 */
export function RoomBoard({ rooms, onMove, busy }: { rooms: HousekeepingRow[]; onMove?: (room: HousekeepingRow) => void; busy?: number | null }) {
  if (rooms.length === 0) return null;
  return (
    <Card title="The floor">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
        {rooms.map((r) => {
          const tone = HOUSEKEEPING_TONE[r.housekeeping] ?? MONEY_TONE.neutral;
          const Icon = r.housekeeping === "CLEAN" ? Sparkles : r.housekeeping === "CLEANING" ? Brush : BedDouble;
          return (
            <button
              key={r.id}
              type="button"
              disabled={!onMove || busy === r.id}
              onClick={() => onMove?.(r)}
              title={`${r.name} — ${housekeepingLabel(r.housekeeping)}${onMove ? `. Press: ${nextHousekeepingState(r.housekeeping).label}` : ""}`}
              className="group relative min-h-[112px] overflow-hidden rounded-xl p-3 text-left transition enabled:hover:-translate-y-0.5 enabled:hover:shadow-md disabled:cursor-default"
              style={{ background: tone.soft, boxShadow: `inset 0 0 0 1.5px ${tone.solid}33` }}
            >
              <div className="absolute inset-x-0 top-0 h-1" style={{ background: tone.solid }} />
              <Icon className="h-5 w-5" style={{ color: tone.solid }} />
              <div className="mt-1.5 text-lg font-extrabold text-slate-900">{r.name}</div>
              <div className="truncate text-[10px] font-semibold uppercase tracking-wide" style={{ color: tone.solid }}>
                {housekeepingLabel(r.housekeeping)}
              </div>
              {r.arrivingToday && <div className="mt-0.5 truncate text-[10px] text-slate-500">Arriving today</div>}
              {r.status !== "ACTIVE" && <div className="mt-0.5 truncate text-[10px] text-slate-500">Out of service</div>}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
        {Object.entries(HOUSEKEEPING_TONE).map(([k, t]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.solid }} />
            {housekeepingLabel(k)} · {rooms.filter((r) => r.housekeeping === k).length}
          </span>
        ))}
      </div>
    </Card>
  );
}
