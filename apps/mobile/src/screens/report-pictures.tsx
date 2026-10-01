/**
 * The rest of the console's reports, on the phone, as pictures: how the
 * money arrived and who took it, rent sold by each agency, where the
 * bookings came from, and the period day by day — or month by month when
 * the period is long enough that days would be hairlines.
 *
 * Each card reads its own report for the same period as the summary above
 * it, so the phone and the console draw the same figures
 * (`apps/web/src/components/report-charts.tsx`).
 */
import { View } from "react-native";
import { keys, useApi } from "@rh/app-core";
import {
  methodLabel,
  monthName,
  type AgentPerformanceReport,
  type CollectorsReport,
  type DailyRevenueRow,
  type SourceReport,
} from "@rh/shared";
import { client } from "../api/session";
import { BarList, Columns, Legend, Shares } from "../design/charts";
import { Card } from "../design/surface";
import { color, space } from "../design/tokens";

const tone = color.chart.money;
const series = (i: number) => color.chart.series[i % color.chart.series.length]!;

export function ReportPictures({
  resortId,
  range,
  whole,
}: {
  resortId: number;
  range: { from: string; to: string };
  whole: (n: number) => string;
}) {
  const key = `${range.from}:${range.to}`;
  const collectors = useApi<CollectorsReport>(keys.reports(resortId, "collectors", key), () =>
    client.reports.collectors(resortId, range),
  );
  const agents = useApi<AgentPerformanceReport>(keys.reports(resortId, "agents", key), () =>
    client.reports.agents(resortId, range),
  );
  const sources = useApi<SourceReport>(keys.reports(resortId, "sources", key), () =>
    client.reports.sources(resortId, range),
  );
  const daily = useApi<DailyRevenueRow[]>(keys.reports(resortId, "daily", key), () =>
    client.reports.daily(resortId, range.from, range.to),
  );

  // a long period by month, a short one by day
  const days = daily.data ?? [];
  const byMonth = days.length > 45;
  const buckets = byMonth
    ? [...days.reduce((m, d) => {
        const k = d.date.slice(0, 7);
        const b = m.get(k) ?? { rooms: 0, fb: 0, expenses: 0 };
        b.rooms += d.roomRevenue;
        b.fb += d.fbRevenue;
        b.expenses += d.expenses;
        return m.set(k, b);
      }, new Map<string, { rooms: number; fb: number; expenses: number }>())].map(([k, v]) => ({
        label: monthName(k, "short").slice(0, 3),
        title: monthName(k),
        values: v,
      }))
    : days.map((d, i) => ({
        label: i % 5 === 0 || i === days.length - 1 ? String(Number(d.date.slice(8, 10))) : "",
        title: d.date,
        values: { rooms: d.roomRevenue, fb: d.fbRevenue, expenses: d.expenses },
      }));

  const agencies = [
    ...(agents.data?.rows ?? []).reduce((m, r) => {
      const a = m.get(r.agency) ?? { rent: 0, commission: 0, bookings: 0 };
      a.rent += r.rent;
      a.commission += r.commission;
      a.bookings += r.bookings;
      return m.set(r.agency, a);
    }, new Map<string, { rent: number; commission: number; bookings: number }>()),
  ].sort((x, y) => y[1].rent - x[1].rent);

  const c = collectors.data;

  return (
    <View style={{ gap: space.lg }}>
      {buckets.some((b) => b.values.rooms + b.values.fb + b.values.expenses > 0) ? (
        <Card title={byMonth ? "Month by month" : "Day by day"}>
          <Columns
            height={140}
            formatFull={whole}
            series={[
              { key: "rooms", label: "Rooms", color: tone.paid.solid },
              { key: "fb", label: "Restaurant", color: tone.advance.solid },
            ]}
            marker={{ key: "expenses", label: "Spent", color: tone.expense.solid }}
            data={buckets}
          />
          <Legend
            items={[
              { label: "Rooms", color: tone.paid.solid },
              { label: "Restaurant", color: tone.advance.solid },
              { label: "Spent", color: tone.expense.solid },
            ]}
          />
        </Card>
      ) : null}

      {c && c.total > 0 ? (
        <Card title="How the money arrived">
          <Shares
            format={whole}
            parts={c.byMethod.map((m, i) => ({ label: methodLabel(m.method), value: m.total, color: series(i) }))}
          />
        </Card>
      ) : null}

      {c && c.rows.length > 0 ? (
        <Card title="Who took it">
          <BarList
            format={whole}
            limit={8}
            barColor={tone.income.solid}
            rows={c.rows.map((r) => ({ label: r.name, sub: `${r.count} payment${r.count === 1 ? "" : "s"}`, value: r.total }))}
          />
        </Card>
      ) : null}

      {agencies.length > 0 ? (
        <Card title="Rent sold, by agency">
          <BarList
            format={whole}
            limit={8}
            barColor={tone.income.solid}
            rows={agencies.map(([agency, v]) => ({
              label: agency,
              sub: `${whole(v.commission)} commission`,
              value: v.rent,
            }))}
          />
        </Card>
      ) : null}

      {(sources.data?.rows.length ?? 0) > 0 ? (
        <Card title="Where the bookings came from">
          <Shares
            format={whole}
            parts={sources.data!.rows.map((r, i) => ({
              label: `${r.source.replace(/_/g, " ").toLowerCase()} (${r.bookings})`,
              value: r.rent,
              color: series(i),
            }))}
          />
        </Card>
      ) : null}
    </View>
  );
}
