"use client";

/**
 * The figures and shares above a list — bookings, guests, rooms. The sums are
 * `@rh/shared`'s `bookingsGlance` / `guestsGlance`, which the app draws from too.
 */
import { BedDouble, Brush, CalendarCheck, HandCoins, Sparkles, Wallet } from "lucide-react";
import {
  HOUSEKEEPING_TONE,
  MONEY_TONE,
  NIGHT_TONE,
  activitiesGlance,
  billParts,
  stayNights,
  bookingsGlance,
  calendarGlance,
  daySheetGlance,
  fbGlance,
  compactNumber,
  guestsGlance,
  housekeepingLabel,
  nextHousekeepingState,
  roomsGlance,
  salesGlance,
  sharesBy,
  walletGlance,
  type BookingRow,
  type GuestRow,
  type HousekeepingRow,
  type Room,
} from "@rh/shared";
import { money } from "@/lib/api";
import { Card } from "@/components/ui";
import { AreaChart, BarList, ColumnChart, Donut, KpiCard, Meter } from "@/components/charts";

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
              style={{ background: tone.soft }}
            >
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

/** How full the calendar's stretch is, night by night. */
export function CalendarGlance({ occupancy, sellable, bookings }: { occupancy: { day: string; taken: number }[]; sellable: number; bookings: { checkIn: string; state: string }[] }) {
  if (occupancy.length === 0 || sellable === 0) return null;
  const g = calendarGlance(occupancy, sellable, bookings);
  const label = (d: string) => String(Number(d.slice(8, 10)));
  return (
    <div className="grid gap-3 lg:grid-cols-4">
      <div className="grid grid-cols-2 gap-3 lg:col-span-1 lg:grid-cols-1">
        <KpiCard label="How full" value={`${g.pct}%`} sub={`${g.taken} of ${g.taken + g.free} room-nights`} tone={MONEY_TONE.paid.solid} icon={<BedDouble className="h-4 w-4" />} />
        <KpiCard label="Still to sell" value={String(g.free)} sub={`${g.fullNights} night${g.fullNights === 1 ? "" : "s"} sold out · ${g.arrivals} arrivals`} tone={MONEY_TONE.advance.solid} icon={<CalendarCheck className="h-4 w-4" />} />
      </div>
      <Card title="Rooms sold, night by night" className="lg:col-span-3">
        <ColumnChart
          height={150}
          format={(n) => String(n)}
          formatFull={(n) => `${n} of ${sellable} rooms`}
          series={[{ key: "sold", label: "Sold", color: MONEY_TONE.paid.solid }, { key: "free", label: "Free", color: MONEY_TONE.paid.soft }]}
          data={occupancy.map((d) => ({ label: label(d.day), title: d.day, values: { sold: d.taken, free: Math.max(0, sellable - d.taken) } }))}
        />
      </Card>
    </div>
  );
}

/** Tonight on the day sheet: the house as a ring, and what each room earns. */
export function DaySheetGlance({ rooms }: { rooms: Parameters<typeof daySheetGlance>[0] }) {
  if (rooms.length === 0) return null;
  const g = daySheetGlance(rooms);
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card title="The house tonight">
        <Donut format={(n) => String(n)} center={{ value: `${g.booked}/${rooms.length - g.oos}`, label: "occupied" }} parts={g.parts} size={140} />
      </Card>
      <Card title="What each room earns tonight" className="lg:col-span-2">
        {g.earning.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No room earns tonight.</p>
        ) : (
          <BarList format={money} color={MONEY_TONE.income.solid} rows={g.earning.map((r) => ({ label: r.label, sub: r.sub, value: r.value }))} limit={8} />
        )}
      </Card>
    </div>
  );
}

/** What the restaurant sold over the chosen range. */
export function FbGlance({ bills }: { bills: Parameters<typeof fbGlance>[0] }) {
  if (bills.length === 0) return null;
  const g = fbGlance(bills);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Sold" value={money(g.total)} sub={`${g.count} bill${g.count === 1 ? "" : "s"}`} tone={MONEY_TONE.income.solid} icon={<HandCoins className="h-4 w-4" />} />
        <KpiCard label="Collected" value={money(g.paid)} tone={MONEY_TONE.paid.solid} icon={<Wallet className="h-4 w-4" />} />
        <KpiCard label="Still due" value={money(g.due)} tone={g.due > 0 ? MONEY_TONE.late.solid : MONEY_TONE.neutral.solid} icon={<Wallet className="h-4 w-4" />} />
        <KpiCard label="Average bill" value={money(g.count ? g.total / g.count : 0)} tone={MONEY_TONE.bonus.solid} icon={<CalendarCheck className="h-4 w-4" />} />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Card title="Day by day" className="lg:col-span-2">
          <ColumnChart height={150} format={compactNumber} formatFull={money} series={[{ key: "sold", label: "Sold", color: MONEY_TONE.income.solid }]} data={g.byDay.map((d) => ({ label: String(Number(d.day.slice(8, 10))), title: d.day, values: { sold: d.value } }))} />
        </Card>
        <Card title="Room or walk-in">
          <Donut format={money} center={{ value: compactNumber(g.total), label: "sold" }} parts={g.where} size={130} />
        </Card>
      </div>
      <Card title="What sells">
        <BarList format={money} color={MONEY_TONE.income.solid} rows={g.items} limit={8} />
      </Card>
    </div>
  );
}

/** The week's seats per weekday, and the catalogue by kind and price. */
export function ActivitiesGlance({ acts, categoryLabel }: { acts: Parameters<typeof activitiesGlance>[0]; categoryLabel?: (code: string) => string }) {
  if (acts.length === 0) return null;
  const g = activitiesGlance(acts, categoryLabel);
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card title="Seats each week">
        <ColumnChart height={140} format={(n) => String(n)} formatFull={(n) => `${n} seats`} series={[{ key: "seats", label: "Seats", color: MONEY_TONE.advance.solid }]} data={g.seats.map((s) => ({ label: s.label, values: { seats: s.value } }))} />
        <p className="mt-2 text-xs text-slate-500">{g.onSale} on sale · {g.paused} paused · {g.upcoming} slots coming up</p>
      </Card>
      <Card title="By kind">
        <Donut format={(n) => String(n)} center={{ value: String(acts.length), label: "activities" }} parts={g.byCategory} size={130} />
      </Card>
      <Card title="Price">
        <BarList format={money} color={MONEY_TONE.bonus.solid} rows={g.prices} limit={6} />
      </Card>
    </div>
  );
}

/** The plan's allowance as rings — how much of it the account uses. */
export function PlanUsage({ usage }: { usage: { resorts: number; rooms: number; staffUsers: number; guests: number; limits: { maxResorts: number; maxRoomsPerResort: number } } }) {
  const roomCap = usage.limits.maxRoomsPerResort * Math.max(1, usage.resorts);
  const ring = (used: number, cap: number, label: string, tone: { solid: string; soft: string }) => (
    <Donut
      size={104}
      thickness={14}
      format={(n) => String(n)}
      center={{ value: `${used}/${cap}`, label }}
      parts={[
        { label: "Used", value: used, color: tone.solid },
        { label: "Left", value: Math.max(0, cap - used), color: tone.soft },
      ]}
    />
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {ring(usage.resorts, usage.limits.maxResorts, "resorts", MONEY_TONE.paid)}
      {/* a cap in the thousands is no cap; a ring of 21 in 20,000 says nothing */}
      {roomCap < 1000 ? ring(usage.rooms, roomCap, "rooms", MONEY_TONE.advance) : <KpiCard label="Rooms" value={String(usage.rooms)} sub="No practical cap on this plan" tone={MONEY_TONE.advance.solid} icon={<BedDouble className="h-4 w-4" />} />}
      <KpiCard label="Staff users" value={String(usage.staffUsers)} tone={MONEY_TONE.income.solid} icon={<CalendarCheck className="h-4 w-4" />} />
      <KpiCard label="Guests" value={String(usage.guests)} tone={MONEY_TONE.bonus.solid} icon={<HandCoins className="h-4 w-4" />} />
    </div>
  );
}

/** A stay's nights as a strip — behind, tonight, still to come. */
export function NightStrip({ checkIn, checkOut, today }: { checkIn: string | null; checkOut: string | null; today: string }) {
  const nights = stayNights(checkIn, checkOut, today);
  if (nights.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5" aria-label={`${nights.length} night${nights.length === 1 ? "" : "s"}`}>
      {nights.map((n) => {
        const t = NIGHT_TONE[n.when];
        return (
          <div key={n.day} title={`${n.day}${n.when === "tonight" ? " — tonight" : ""}`} className="w-11 overflow-hidden rounded-lg text-center" style={{ background: t.soft }}>
            <div className="pt-1 text-[9px] font-bold uppercase tracking-wide" style={{ color: t.solid }}>{n.weekday}</div>
            <div className="pb-1.5 text-sm font-extrabold text-slate-800">{n.date}</div>
          </div>
        );
      })}
    </div>
  );
}

/** What a bill is made of, and how much of it is paid — the booking's money at a glance. */
export function BillPicture({ bill, paid, paidLabel = "Paid" }: { bill: { roomRent: number; rent: number; tax: number; total: number }; paid: number; paidLabel?: string }) {
  const p = billParts(bill, paid);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">What it is made of</div>
        <Meter format={money} parts={p.made} height={14} />
      </div>
      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">How much is paid</div>
        <Meter format={money} parts={p.money.map((m) => (m.key === "paid" ? { ...m, label: paidLabel } : m))} height={14} />
      </div>
    </div>
  );
}

/** An agency's guests: who comes back, and who has spent the most. */
export function AgencyGuestsGlance({ rows }: { rows: { fullName: string; phone: string; bookings: number; spend: number }[] }) {
  if (rows.length === 0) return null;
  const g = guestsGlance(rows);
  const top = [...rows].sort((a, b) => b.spend - a.spend).slice(0, 6);
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card title="Who comes back">
        <Donut format={(n) => String(n)} center={{ value: String(g.returning), label: "returning" }} parts={g.loyalty} size={140} />
      </Card>
      <Card title="Booked the most through you" className="lg:col-span-2">
        <BarList format={money} color={MONEY_TONE.income.solid} rows={top.map((r) => ({ label: r.fullName, sub: r.phone, value: r.spend }))} />
      </Card>
    </div>
  );
}

/** Quotations or invoices at a glance. */
export function SalesGlance({ docs, what }: { docs: Parameters<typeof salesGlance>[0]; what: string }) {
  if (docs.length === 0) return null;
  const g = salesGlance(docs);
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card title="Where they stand">
        <Donut format={(n) => String(n)} center={{ value: String(docs.length), label: what.toLowerCase() }} parts={g.byStatus} size={140} />
      </Card>
      <Card title="The money in them" className="lg:col-span-2">
        <Meter format={money} parts={[{ label: "Paid", value: g.paid, color: MONEY_TONE.paid.solid }, { label: "Due", value: g.due, color: MONEY_TONE.left.solid }]} height={18} />
        <p className="mt-3 text-xs text-slate-500">{money(g.total)} written in all</p>
      </Card>
    </div>
  );
}

/** Each package's price, split into what it costs and what it earns. */
export function ToursGlance({ packages }: { packages: { name: string; totals: { cost: number; margin: number; price: number } }[] }) {
  if (packages.length === 0) return null;
  return (
    <Card title="Cost and margin, package by package">
      <ColumnChart
        height={170}
        format={compactNumber}
        formatFull={money}
        series={[{ key: "cost", label: "Cost", color: MONEY_TONE.deduction.solid }, { key: "margin", label: "Margin", color: MONEY_TONE.paid.solid }]}
        data={packages.map((p) => ({ label: p.name.length > 14 ? `${p.name.slice(0, 13)}…` : p.name, title: p.name, values: { cost: Math.max(0, p.totals.cost), margin: Math.max(0, p.totals.margin) } }))}
      />
    </Card>
  );
}

/** The wallet's balance as a line, with what went in and out. */
export function WalletGlance({ txns }: { txns: Parameters<typeof walletGlance>[0] }) {
  if (txns.length === 0) return null;
  const g = walletGlance(txns);
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card title="The balance over time" className="lg:col-span-2">
        <AreaChart height={160} format={compactNumber} formatFull={money} series={[{ key: "balance", label: "Balance", color: MONEY_TONE.income.solid }]} data={g.balance.map((b) => ({ label: b.day.slice(5), title: b.day, values: { balance: b.value } }))} />
      </Card>
      <Card title="In and out">
        <Donut format={money} center={{ value: compactNumber(g.in - g.out), label: "net" }} parts={[{ label: "Came in", value: g.in, color: MONEY_TONE.paid.solid }, { label: "Went out", value: g.out, color: MONEY_TONE.late.solid }]} size={130} />
      </Card>
    </div>
  );
}

/** The people on a team as faces, coloured by what they do, with the split as a ring. */
export function PeopleGlance({ people }: { people: { name: string; group: string; active: boolean }[] }) {
  if (people.length === 0) return null;
  const parts = sharesBy(people, (p) => p.group, (g) => g);
  const tint = new Map(parts.map((p) => [p.key, p.color]));
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card title="Who is on the team" className="lg:col-span-2">
        <div className="flex flex-wrap gap-4">
          {people.map((p, i) => (
            <div key={i} className={`flex w-20 flex-col items-center text-center ${p.active ? "" : "opacity-40"}`}>
              <div className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-extrabold text-white shadow-sm" style={{ background: tint.get(p.group) }}>
                {p.name.trim().charAt(0).toUpperCase() || "?"}
              </div>
              <div className="mt-1 w-full truncate text-xs font-semibold text-slate-700">{p.name}</div>
              <div className="w-full truncate text-[10px] text-slate-400">{p.group}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="By role">
        <Donut format={(n) => String(n)} center={{ value: String(people.length), label: "people" }} parts={parts} size={130} />
      </Card>
    </div>
  );
}
