"use client";

/**
 * The reports, in pictures — one chart above each report's table.
 *
 * The tables stay: a chart is for seeing the shape at a glance, a table for
 * reading the figure off. Each chart draws exactly what its table lists, from
 * the same response, so the two cannot disagree.
 */

import {
  MONEY_TONE,
  compactNumber,
  seriesColor,
  type AgentPerformanceRow,
  type CollectorsReport,
  type DailyRevenueRow,
  type PLReport,
  type ResortMetrics,
  type SourceReportRow,
} from "@rh/shared";
import { money } from "@/lib/api";
import { AreaChart, BarList, ColumnChart, Donut, Legend, Meter } from "@/components/charts";

const dayShort = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** How the money arrived, and who took it. */
export function MoneyArrivedCharts({ c, methodLabel }: { c: CollectorsReport; methodLabel: (m: string | null) => string }) {
  if (c.total <= 0) return null;
  return (
    <div className="mt-4 grid gap-6 rounded-xl border border-slate-100 bg-slate-50/50 p-4 lg:grid-cols-2">
      <div>
        <div className="mb-2 text-xs font-semibold text-slate-500">How it arrived</div>
        <Donut
          format={money}
          center={{ value: compactNumber(c.total), label: "received" }}
          parts={c.byMethod.map((m, i) => ({ label: methodLabel(m.method), value: m.total, color: seriesColor(i) }))}
        />
      </div>
      <div>
        <div className="mb-2 text-xs font-semibold text-slate-500">Who took it</div>
        <BarList
          format={money}
          limit={8}
          color={MONEY_TONE.income.solid}
          rows={c.rows.map((r) => ({ label: r.name, value: r.total, sub: `${r.count} payment${r.count === 1 ? "" : "s"}` }))}
        />
      </div>
    </div>
  );
}

/** Billed against received, and where the income went. */
export function SummaryCharts({ m }: { m: ResortMetrics }) {
  const billed = m.netRoomRevenue + m.restaurantRevenue;
  const kept = Math.max(0, m.netProfit);
  return (
    <div className="mb-5 grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-100 p-4">
        <div className="mb-3 text-xs font-semibold text-slate-500">Of what was billed</div>
        <Meter
          height={16}
          format={money}
          total={Math.max(billed, m.grossIncome + m.stillDue)}
          parts={[
            { label: "Received", value: m.grossIncome, color: MONEY_TONE.paid.solid },
            { label: "Still due", value: m.stillDue, color: MONEY_TONE.left.solid },
          ]}
        />
      </div>
      <div className="rounded-xl border border-slate-100 p-4">
        <div className="mb-3 text-xs font-semibold text-slate-500">Where the income went</div>
        <Meter
          height={16}
          format={money}
          total={Math.max(m.grossIncome, m.expenses)}
          parts={[
            { label: "Spent", value: m.expenses, color: MONEY_TONE.expense.solid },
            { label: m.netProfit >= 0 ? "Kept as profit" : "Loss", value: m.netProfit >= 0 ? kept : -m.netProfit, color: m.netProfit >= 0 ? MONEY_TONE.paid.solid : MONEY_TONE.late.solid },
          ]}
        />
      </div>
    </div>
  );
}

/** Income against what it cost, side by side, then what the spending was on. */
export function PLCharts({ pl }: { pl: PLReport }) {
  const columns = [
    { key: "income", label: "Resort income", value: pl.resort.income, color: MONEY_TONE.paid.solid },
    { key: "expenses", label: "Resort expenses", value: pl.resort.expenses, color: MONEY_TONE.expense.solid },
    { key: "payroll", label: "Payroll", value: pl.resort.payroll, color: MONEY_TONE.bonus.solid },
    { key: "rIncome", label: "Restaurant income", value: pl.restaurant.income, color: MONEY_TONE.income.solid },
    { key: "rExpenses", label: "Restaurant expenses", value: pl.restaurant.expenses, color: "#fb7185" },
    { key: "net", label: "Net profit", value: Math.max(0, pl.combined.net), color: MONEY_TONE.advance.solid },
  ];
  const spending = new Map<string, number>();
  for (const c of [...pl.resort.expenseCategories, ...pl.restaurant.expenseCategories]) {
    spending.set(c.category, (spending.get(c.category) ?? 0) + c.amount);
  }
  if (pl.resort.payroll > 0) spending.set("Payroll", (spending.get("Payroll") ?? 0) + pl.resort.payroll);
  const parts = [...spending.entries()].sort((a, b) => b[1] - a[1]);
  const top = parts.slice(0, 7);
  const rest = parts.slice(7).reduce((s, [, v]) => s + v, 0);
  return (
    <div className="mb-5 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="rounded-xl border border-slate-100 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-500">Money in, money out</span>
          {pl.combined.net < 0 && <span className="text-xs font-semibold text-red-600">A loss of {money(-pl.combined.net)}</span>}
        </div>
        <ColumnChart
          height={240}
          formatFull={money}
          series={columns.map((c) => ({ key: c.key, label: c.label, color: c.color }))}
          data={columns.map((c) => ({ label: c.label.replace("Restaurant", "Rest."), title: c.label, values: { [c.key]: c.value } }))}
        />
      </div>
      <div className="rounded-xl border border-slate-100 p-4">
        <div className="mb-2 text-xs font-semibold text-slate-500">What the spending was on</div>
        {top.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">Nothing spent in this period</div>
        ) : (
          <Donut
            format={money}
            center={{ value: compactNumber(pl.combined.expenses), label: "spent" }}
            parts={[
              ...top.map(([label, value], i) => ({ label, value, color: seriesColor(i + 1) })),
              ...(rest > 0 ? [{ label: "Everything else", value: rest, color: "#94a3b8" }] : []),
            ]}
          />
        )}
      </div>
    </div>
  );
}

/** Rent sold by each agency, with what they earned on it. */
export function AgentsChart({ rows }: { rows: AgentPerformanceRow[] }) {
  const byAgency = new Map<string, { rent: number; commission: number; bookings: number }>();
  for (const r of rows) {
    const a = byAgency.get(r.agency) ?? { rent: 0, commission: 0, bookings: 0 };
    a.rent += r.rent;
    a.commission += r.commission;
    a.bookings += r.bookings;
    byAgency.set(r.agency, a);
  }
  const list = [...byAgency.entries()].sort((x, y) => y[1].rent - x[1].rent);
  return (
    <div className="border-b border-slate-100 p-4">
      <div className="mb-2 text-xs font-semibold text-slate-500">Rent sold, by agency</div>
      <BarList
        format={money}
        limit={10}
        color={MONEY_TONE.income.solid}
        rows={list.map(([agency, v]) => ({
          label: agency,
          value: v.rent,
          sub: `${v.bookings} booking${v.bookings === 1 ? "" : "s"} · ${money(v.commission)} commission`,
        }))}
      />
    </div>
  );
}

/** Where the bookings came from, by what they were worth. */
export function SourcesChart({ rows }: { rows: SourceReportRow[] }) {
  const total = rows.reduce((s, r) => s + r.bookings, 0);
  return (
    <div className="border-b border-slate-100 p-4">
      <div className="mb-2 text-xs font-semibold text-slate-500">Rent, by where the booking came from</div>
      <Donut
        format={money}
        center={{ value: String(total), label: total === 1 ? "booking" : "bookings" }}
        parts={rows.map((r, i) => ({ label: `${r.source.replace(/_/g, " ").toLowerCase()} (${r.bookings})`, value: r.rent, color: seriesColor(i) }))}
      />
    </div>
  );
}

/** The days, as a trend: what the rooms and the restaurant made, against what was spent. */
export function DailyCharts({ rows }: { rows: DailyRevenueRow[] }) {
  const data = rows.map((d) => ({
    label: dayShort(d.date),
    title: d.date,
    values: { rooms: d.roomRevenue, fb: d.fbRevenue, expenses: d.expenses, net: d.net },
  }));
  const totals = rows.reduce(
    (s, d) => ({ rooms: s.rooms + d.roomRevenue, fb: s.fb + d.fbRevenue, expenses: s.expenses + d.expenses, net: s.net + d.net }),
    { rooms: 0, fb: 0, expenses: 0, net: 0 },
  );
  return (
    <div className="border-b border-slate-100 p-4">
      <Legend
        className="mb-3"
        items={[
          { label: "Rooms", color: MONEY_TONE.paid.solid, value: money(totals.rooms) },
          { label: "Restaurant", color: MONEY_TONE.advance.solid, value: money(totals.fb) },
          { label: "Expenses", color: MONEY_TONE.expense.solid, value: money(totals.expenses) },
          { label: "Net", color: "#0f172a", value: money(totals.net) },
        ]}
      />
      <AreaChart
        height={240}
        formatFull={money}
        data={data}
        series={[
          { key: "rooms", label: "Rooms", color: MONEY_TONE.paid.solid },
          { key: "fb", label: "Restaurant", color: MONEY_TONE.advance.solid },
          { key: "expenses", label: "Expenses", color: MONEY_TONE.expense.solid },
        ]}
      />
    </div>
  );
}
