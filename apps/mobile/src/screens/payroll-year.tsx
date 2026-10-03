/**
 * A year of payroll in pictures, on the phone — the report the owner asked
 * for: month by month what went out and what is still to pay; who was paid
 * when, as a timeline (tap a month to open it); where the wage bill goes by
 * role; and who has been paid most.
 */
import { StyleSheet, View } from "react-native";
import {
  PAYROLL_MONTH_STATE_LABELS,
  compactNumber,
  monthName,
  type PayrollMonthState,
  type PayrollYear,
  type PayrollYearCell,
} from "@rh/shared";
import { BarList, Columns, Kpi, Legend, Shares, TimelineGrid } from "../design/charts";
import { Empty } from "../design/states";
import { Card } from "../design/surface";
import { color, space } from "../design/tokens";

const tone = color.chart.money;
const states = color.chart.payrollState;

export function PayrollYearView({
  y,
  whole,
  openMonth,
}: {
  y: PayrollYear;
  whole: (n: number) => string;
  openMonth: (month: string) => void;
}) {
  if (y.people.length === 0) {
    return (
      <Card>
        <Empty message={`Nothing recorded on payroll in ${y.year}`} />
      </Card>
    );
  }
  const currentIdx = y.months.indexOf(y.current);
  const shown: PayrollMonthState[] = ["SETTLED", "PART_PAID", "UNPAID", "RUNNING", "UPCOMING"];

  return (
    <View style={styles.gap}>
      <View style={styles.figures}>
        <Kpi
          label={y.totals.upcoming > 0 ? "Wage bill so far" : "Wage bill"}
          value={whole(y.totals.due)}
          tint={color.title}
          sub={y.totals.upcoming > 0 ? `${whole(y.totals.upcoming)} more ahead` : undefined}
        />
        <Kpi label="Paid out" value={whole(y.totals.paid)} tint={tone.paid.solid} sub={`${whole(y.totals.advance)} as advances`} />
        <Kpi
          label="Bonuses"
          value={whole(y.totals.bonus)}
          tint={tone.bonus.solid}
          sub={y.totals.deduction > 0 ? `${whole(y.totals.deduction)} deducted` : undefined}
        />
        <Kpi
          label="Still to pay"
          value={whole(y.totals.remaining)}
          tint={y.totals.remaining > 0 ? color.warn.fg : tone.paid.solid}
          sub="for months up to now"
        />
      </View>

      <Card title="Month by month">
        <Columns
          active={currentIdx >= 0 ? currentIdx : undefined}
          formatFull={whole}
          series={[
            { key: "salary", label: "Salary", color: tone.paid.solid },
            { key: "advance", label: "Advances", color: tone.advance.solid },
            { key: "left", label: "Still to pay", color: tone.left.solid },
            { key: "ahead", label: "Ahead", color: color.ink[300] },
          ]}
          marker={{ key: "due", label: "Worth", color: color.ink[900] }}
          data={y.byMonth.map((m) => ({
            label: monthName(m.month, "short").slice(0, 1),
            title: `${monthName(m.month)} · ${m.headcount} on payroll`,
            values:
              m.month > y.current
                ? { salary: Math.max(0, m.paid - m.advance), advance: m.advance, left: 0, ahead: m.remaining, due: m.due }
                : { salary: Math.max(0, m.paid - m.advance), advance: m.advance, left: m.remaining, ahead: 0, due: m.due },
          }))}
        />
        <Legend
          items={[
            { label: "Salary", color: tone.paid.solid },
            { label: "Advances", color: tone.advance.solid },
            { label: "Still to pay", color: tone.left.solid },
            { label: "Months ahead", color: color.ink[300] },
            { label: "Worth", color: color.ink[900] },
          ]}
        />
      </Card>

      <Card title="Who was paid when">
        <TimelineGrid<PayrollYearCell>
          columns={y.months.map((m) => monthName(m, "short"))}
          activeColumn={currentIdx >= 0 ? currentIdx : undefined}
          rows={y.people.map((p) => ({
            key: String(p.employeeId),
            label: p.name,
            sub: p.designation ?? undefined,
            cells: p.cells,
          }))}
          onPick={(_, ci) => openMonth(y.months[ci]!)}
          cell={(c, ri) => {
            const t = states[c.state] ?? states.UPCOMING!;
            const off = c.state === "NOT_ON_PAYROLL";
            const pale = off || c.state === "UPCOMING" || c.state === "RUNNING";
            const word = PAYROLL_MONTH_STATE_LABELS[c.state as PayrollMonthState]?.label ?? c.state;
            return {
              fill: pale ? t.soft : t.solid,
              ink: c.state === "RUNNING" ? t.solid : pale ? color.muted : color.onBrand,
              dashed: off,
              text: off || c.state === "UPCOMING" ? "" : c.paid > 0 ? compactNumber(c.paid) : "0",
              label: off
                ? `${y.people[ri]!.name}, ${monthName(c.month)}: not on payroll`
                : `${y.people[ri]!.name}, ${monthName(c.month)}: ${word}, paid ${whole(c.paid)} of ${whole(c.due)}`,
            };
          }}
        />
        <Legend
          items={shown.map((s) => ({
            label: PAYROLL_MONTH_STATE_LABELS[s].label,
            color: s === "RUNNING" || s === "UPCOMING" ? states[s]!.solid : states[s]!.solid,
          }))}
        />
      </Card>

      <Card title="Monthly wage bill, by role">
        {y.byDesignation.length === 0 ? (
          <Empty icon="account-group-outline" message="Nobody on payroll now" />
        ) : (
          <Shares
            format={whole}
            parts={y.byDesignation.map((d, i) => ({
              label: `${d.designation} (${d.people})`,
              value: d.salary,
              color: color.chart.series[i % color.chart.series.length]!,
            }))}
          />
        )}
      </Card>

      <Card title={`Paid in ${y.year}, by person`}>
        <BarList
          format={whole}
          limit={10}
          rows={[...y.people]
            .sort((p, q) => q.totals.paid - p.totals.paid)
            .map((p) => ({ label: p.name, sub: p.designation ?? undefined, value: p.totals.paid }))}
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.lg },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
});
