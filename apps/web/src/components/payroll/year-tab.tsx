"use client";

/**
 * A year of payroll in pictures — the report the owner asked for.
 *
 * Month by month, what went out and what is still to pay; person by person
 * across the year, a timeline of which months were paid, part paid or not at
 * all (tap one to open that month); where the wage bill goes by role; and who
 * has been paid most. With a CSV of the grid for anybody's spreadsheet.
 */

import { Download, Gift, HandCoins, Banknote, Wallet, CircleAlert } from "lucide-react";
import {
  MONEY_TONE,
  PAYROLL_MONTH_STATE_LABELS,
  PAYROLL_STATE_TONE,
  compactNumber,
  monthName,
  seriesColor,
  type PayrollMonthState,
  type PayrollYear,
  type PayrollYearCell,
} from "@rh/shared";
import { money } from "@/lib/api";
import { useApi } from "@/lib/query";
import { Button, Card, Empty, Spinner } from "@/components/ui";
import { ErrorState } from "@/components/error-state";
import { BarList, ColumnChart, Donut, KpiCard, Legend, TimelineGrid } from "@/components/charts";
import type { PayrollAdapter } from "./adapter";
import { StateLegend, YearStepper } from "./bits";

function csv(y: PayrollYear): string {
  const head = ["Name", "Designation", ...y.months.map((m) => monthName(m, "year")), "Worth", "Paid", "Left"];
  const rows = y.people.map((p) => [
    p.name,
    p.designation ?? "",
    ...p.cells.map((c) => (c.state === "NOT_ON_PAYROLL" ? "" : `${c.paid}/${c.due}`)),
    p.totals.due,
    p.totals.paid,
    p.totals.remaining,
  ]);
  return [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function YearTab({
  a,
  year,
  setYear,
  openMonth,
}: {
  a: PayrollAdapter;
  year: number;
  setYear: (y: number) => void;
  openMonth: (m: string) => void;
}) {
  const q = useApi(a.yearKey(year), () => a.year(year), { placeholderData: (prev: PayrollYear | undefined) => prev });
  if (q.error) return <ErrorState error={q.error as Error} />;
  const y = q.data;
  const currentIdx = y ? y.months.indexOf(y.current) : -1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <YearStepper year={year} onChange={setYear} />
        {y && y.people.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => download(`payroll-${year}.csv`, csv(y))}>
            <Download className="h-4 w-4" /> Download the year (CSV)
          </Button>
        )}
      </div>

      {!y ? (
        <Spinner />
      ) : y.people.length === 0 ? (
        <Card>
          <Empty msg={`Nothing recorded on payroll in ${year}.`} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <KpiCard
              label={y.totals.upcoming > 0 ? `${year} wage bill so far` : `${year} wage bill`}
              value={money(y.totals.due)}
              icon={<Banknote className="h-3.5 w-3.5" />}
              trend={y.byMonth.filter((m) => m.month <= y.current).map((m) => m.due)}
              trendColor="#0f172a"
              sub={y.totals.upcoming > 0 ? `${money(y.totals.upcoming)} more in the months ahead` : undefined}
            />
            <KpiCard label="Paid out" value={money(y.totals.paid)} tone={MONEY_TONE.paid.solid} icon={<HandCoins className="h-3.5 w-3.5" />} trend={y.byMonth.map((m) => m.paid)} />
            <KpiCard label="As advances" value={money(y.totals.advance)} tone={MONEY_TONE.advance.solid} icon={<Wallet className="h-3.5 w-3.5" />} trend={y.byMonth.map((m) => m.advance)} />
            <KpiCard label="Bonuses" value={money(y.totals.bonus)} tone={MONEY_TONE.bonus.solid} icon={<Gift className="h-3.5 w-3.5" />} sub={y.totals.deduction > 0 ? `${money(y.totals.deduction)} deducted` : undefined} />
            <KpiCard label="Still to pay" value={money(y.totals.remaining)} tone={y.totals.remaining > 0 ? "#b45309" : MONEY_TONE.paid.solid} icon={<CircleAlert className="h-3.5 w-3.5" />} sub="for months up to now" />
          </div>

          <Card title="Month by month" action={<Legend items={[
            { label: "Salary paid", color: MONEY_TONE.paid.solid },
            { label: "Advances", color: MONEY_TONE.advance.solid },
            { label: "Still to pay", color: MONEY_TONE.left.solid },
            { label: "Months ahead", color: "#cbd5e1" },
            { label: "Worth", color: "#0f172a" },
          ]} />}>
            <ColumnChart
              height={260}
              active={currentIdx >= 0 ? currentIdx : undefined}
              onPick={(i) => openMonth(y.months[i]!)}
              formatFull={money}
              series={[
                { key: "salary", label: "Salary paid", color: MONEY_TONE.paid.solid },
                { key: "advance", label: "Advances", color: MONEY_TONE.advance.solid },
                { key: "left", label: "Still to pay", color: MONEY_TONE.left.solid },
                { key: "ahead", label: "Month ahead", color: "#cbd5e1" },
              ]}
              marker={{ key: "due", label: "Worth", color: "#0f172a" }}
              data={y.byMonth.map((m) => ({
                label: monthName(m.month, "short"),
                title: `${monthName(m.month)} · ${m.headcount} on payroll`,
                // a month not reached yet is not "still to pay": it is drawn
                // pale, as what it will be worth
                values:
                  m.month > y.current
                    ? { salary: Math.max(0, m.paid - m.advance), advance: m.advance, left: 0, ahead: m.remaining, due: m.due }
                    : { salary: Math.max(0, m.paid - m.advance), advance: m.advance, left: m.remaining, ahead: 0, due: m.due },
              }))}
            />
            <p className="mt-1 text-xs text-slate-400">Click a month to open it.</p>
          </Card>

          <Card title="Who was paid when" action={<StateLegend />}>
            <TimelineGrid<PayrollYearCell>
              columns={y.months.map((m) => ({ key: m, label: monthName(m, "short") }))}
              rows={y.people.map((p) => ({
                key: String(p.employeeId),
                label: p.name,
                sub: [p.designation, p.active ? null : "left"].filter(Boolean).join(" · ") || undefined,
                cells: p.cells,
              }))}
              activeColumn={currentIdx >= 0 ? currentIdx : undefined}
              onPick={(_, ci) => openMonth(y.months[ci]!)}
              cell={(c, ri) => {
                const tone = PAYROLL_STATE_TONE[c.state] ?? PAYROLL_STATE_TONE.UPCOMING!;
                const off = c.state === "NOT_ON_PAYROLL";
                const pale = off || c.state === "UPCOMING" || c.state === "RUNNING";
                const label = PAYROLL_MONTH_STATE_LABELS[c.state as PayrollMonthState]?.label ?? c.state;
                return {
                  fill: pale ? tone.soft : tone.solid,
                  ink: c.state === "RUNNING" ? tone.solid : pale ? "#94a3b8" : "#fff",
                  dashed: off,
                  text: off ? "" : c.paid > 0 ? compactNumber(c.paid) : c.state === "UPCOMING" ? "" : "0",
                  title: off
                    ? `${y.people[ri]!.name} — ${monthName(c.month)}: not on payroll`
                    : `${y.people[ri]!.name} — ${monthName(c.month)}: ${label}. Worth ${money(c.due)}, paid ${money(c.paid)}${c.advance ? ` (${money(c.advance)} advance)` : ""}${c.bonus ? `, bonus ${money(c.bonus)}` : ""}${c.deduction ? `, deduction ${money(c.deduction)}` : ""}, left ${money(c.remaining)}.`,
                };
              }}
            />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="The monthly wage bill, by role">
              {y.byDesignation.length === 0 ? (
                <Empty msg="Nobody on payroll now" />
              ) : (
                <Donut
                  format={money}
                  center={{ value: compactNumber(y.byDesignation.reduce((s, d) => s + d.salary, 0)), label: "a month" }}
                  parts={y.byDesignation.map((d, i) => ({ label: `${d.designation} (${d.people})`, value: d.salary, color: seriesColor(i) }))}
                />
              )}
            </Card>
            <Card title={`Paid in ${year}, by person`}>
              <BarList
                format={money}
                limit={10}
                rows={[...y.people]
                  .sort((p, q2) => q2.totals.paid - p.totals.paid)
                  .map((p) => ({
                    label: p.name,
                    sub: p.designation ?? undefined,
                    value: p.totals.paid,
                    color: MONEY_TONE.paid.solid,
                  }))}
              />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
