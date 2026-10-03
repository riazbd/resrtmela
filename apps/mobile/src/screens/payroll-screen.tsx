/**
 * The payroll screen on the phone, for a resort or an agency.
 *
 * The owner, 2026-10-02, on the old one: who connects to whom, who is on
 * payroll and who is not, what anybody gets — "kichui bujha jay na", and
 * nothing but text and numbers. So: how payroll works, said on the screen in
 * four lines; then three views of it — **Month** (what this month comes to
 * and who is still to be paid), **Year** (the report, in pictures) and
 * **People** (who is on payroll, and the app logins beside them).
 */
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useApi } from "@rh/app-core";
import { addMonths, formatMoney, monthName, payRunOf, type PayrollPeople, type PayrollSheet, type PayrollYear } from "@rh/shared";
import { Button } from "../design/button";
import { Lenses } from "../design/lenses";
import { useMoneyFormat } from "../design/money";
import { Loading, Problem, Stale } from "../design/states";
import { Text } from "../design/text";
import { color, radius, space } from "../design/tokens";
import type { PayrollAdapter } from "./payroll-adapter";
import { PayrollMonth, type PayMethod } from "./payroll-month";
import { NobodyThisMonth, PayRunCard, PayrollSetup } from "./pay-run";
import { PayrollPeopleView } from "./payroll-people";
import { PayrollYearView } from "./payroll-year";

/** Named for what a payroll desk does: run the month, keep the team, read the reports. */
const VIEWS = ["Run payroll", "Team", "Reports"] as const;
type View_ = (typeof VIEWS)[number];

function Explained({ owner }: { owner: "resort" | "agency" }) {
  const [open, setOpen] = useState(false);
  const points = [
    ["Who is on payroll", "Everyone you pay a monthly salary, from the day they joined until the day they left. They do not need an app login."],
    ["What they get", "The salary for the days they were on payroll that month, plus any bonus, less any deduction."],
    ["How it is paid", "Advances during the month, the rest when it is settled. Anything paid beyond a month comes off the next one."],
    [
      "Logins are separate",
      owner === "resort"
        ? "A login decides who can use the app. Link it to the person on payroll under People. Agents earn commission, not a salary, so they are never here."
        : "A login decides who can use the app. Link your staff's logins to them under People.",
    ],
  ] as const;
  return (
    <View style={styles.explain}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="How payroll works"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={styles.explainHead}
      >
        <Text step="small" weight="bold" tone="title">
          How payroll works
        </Text>
        <Text step="small" tone="muted">
          {open ? "Hide" : "Show"}
        </Text>
      </Pressable>
      {open
        ? points.map(([title, body]) => (
            <View key={title} style={styles.point}>
              <Text step="small" weight="medium" tone="title">
                {title}
              </Text>
              <Text step="small" tone="muted">
                {body}
              </Text>
            </View>
          ))
        : null}
    </View>
  );
}

export function PayrollScreen({
  a,
  methods,
  today,
}: {
  a: PayrollAdapter;
  methods: PayMethod[];
  /** "YYYY-MM-DD" where the payroll is kept */
  today: string;
}) {
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });
  const [view, setView] = useState<View_>("Run payroll");
  const [adding, setAdding] = useState(false);
  const toTeam = (add: boolean) => {
    setAdding(add);
    setView("Team");
  };
  const [month, setMonth] = useState(a.currentMonth);
  const [year, setYear] = useState(Number(a.currentMonth.slice(0, 4)));

  const sheet = useApi<PayrollSheet>(a.sheetKey(month), () => a.sheet(month), {
    enabled: view === "Run payroll",
    placeholderData: (prev: PayrollSheet | undefined) => prev,
  });
  const yearQ = useApi<PayrollYear>(a.yearKey(year), () => a.year(year), {
    enabled: view === "Reports",
    placeholderData: (prev: PayrollYear | undefined) => prev,
  });
  const people = useApi<PayrollPeople>(a.peopleKey, () => a.people(), { enabled: view !== "Reports" });

  const q = view === "Run payroll" ? (sheet.data ? people : sheet) : view === "Reports" ? yearQ : people;

  let body: React.ReactNode;
  if (q.error && !q.data) body = <Problem error={q.error} onRetry={() => void q.refetch()} />;
  else if (!q.data) body = <Loading what={view === "Team" ? "the people on payroll" : "the payroll"} />;
  else if (view === "Run payroll" && sheet.data && people.data) {
    const everyone = people.data.people;
    body =
      everyone.length === 0 ? (
        <PayrollSetup onAdd={() => toTeam(true)} />
      ) : sheet.data.rows.length === 0 ? (
        <NobodyThisMonth month={month} people={everyone} onTeam={() => toTeam(false)} />
      ) : (
        <>
          <PayRunCard run={payRunOf(sheet.data, { today, peopleCount: everyone.length })} a={a} sheet={sheet.data} methods={methods} whole={whole} />
          <PayrollMonth key={month} a={a} sheet={sheet.data} month={month} monthName={monthName(month)} methods={methods} whole={whole} />
        </>
      );
  }
  else if (view === "Reports" && yearQ.data)
    body = (
      <PayrollYearView
        y={yearQ.data}
        whole={whole}
        openMonth={(m) => {
          setMonth(m);
          setView("Run payroll");
        }}
      />
    );
  else if (view === "Team" && people.data) body = <PayrollPeopleView a={a} people={people.data} whole={whole} today={today} startAdding={adding} />;

  return (
    <>
      <Stale age={q.stale} />
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void a.invalidate()} />}
      >
        <Explained owner={a.owner} />
        <Lenses options={VIEWS} value={view} onChange={setView} />
        {view === "Run payroll" ? (
          <View style={styles.stepper}>
            <Button label="‹ Prev" kind="ghost" block={false} onPress={() => setMonth(addMonths(month, -1))} />
            <Text step="body" weight="medium" tone="title">
              {monthName(month)}
            </Text>
            <Button label="Next ›" kind="ghost" block={false} onPress={() => setMonth(addMonths(month, 1))} />
          </View>
        ) : view === "Reports" ? (
          <View style={styles.stepper}>
            <Button label="‹ Prev" kind="ghost" block={false} onPress={() => setYear(year - 1)} />
            <Text step="body" weight="medium" tone="title">
              {String(year)}
            </Text>
            <Button label="Next ›" kind="ghost" block={false} onPress={() => setYear(year + 1)} />
          </View>
        ) : null}
        {body}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  explain: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  explainHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  point: { gap: 2 },
});
