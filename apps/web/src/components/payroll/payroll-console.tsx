"use client";

/**
 * The payroll screen, for a resort or an agency.
 *
 * Three tabs, each answering one of the owner's questions: **Month** — what
 * does this month come to and who is still to be paid; **Year & reports** —
 * where has the money gone, in pictures; **People** — who is on payroll, and
 * how they connect to the people who use the app.
 */

import { useState } from "react";
import { Tabs } from "@/components/patterns";
import type { PayrollAdapter } from "./adapter";
import { PayrollExplained } from "./explain";
import { MonthTab } from "./month-tab";
import { PeopleTab } from "./people-tab";
import { YearTab } from "./year-tab";

const TABS = ["Month", "Year & reports", "People"] as const;

export function PayrollConsole({ a, subtitle }: { a: PayrollAdapter; subtitle: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Month");
  const [month, setMonth] = useState(() => a.today.slice(0, 7));
  const [year, setYear] = useState(() => Number(a.today.slice(0, 4)));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Payroll</h1>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
      <PayrollExplained owner={a.owner} />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "Month" && <MonthTab a={a} month={month} setMonth={setMonth} />}
      {tab === "Year & reports" && (
        <YearTab
          a={a}
          year={year}
          setYear={setYear}
          openMonth={(m) => {
            setMonth(m);
            setTab("Month");
          }}
        />
      )}
      {tab === "People" && <PeopleTab a={a} />}
    </div>
  );
}
