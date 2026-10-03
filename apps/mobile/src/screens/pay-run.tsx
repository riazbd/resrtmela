/**
 * The month as a pay run — the console's `components/payroll/pay-run.tsx` on
 * the phone: period and payday, the three steps, the sum from gross to what
 * is still to be handed over, and one button that pays everyone. Before
 * anybody is on payroll, the three steps to get there.
 *
 * The figures are `payRunOf` in @rh/shared.
 */
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import * as Print from "expo-print";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { PAY_RUN_STATUS_LABEL, PAY_RUN_STEPS, monthName, payslipHtml, type PayRun, type PayrollSheet } from "@rh/shared";
import { Button } from "../design/button";
import { Chip } from "../design/chip";
import { Card } from "../design/surface";
import { Text } from "../design/text";
import { color, radius, space } from "../design/tokens";
import type { PayrollAdapter } from "./payroll-adapter";
import type { PayMethod } from "./payroll-month";
import { refusal } from "./payroll-month";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

const STATUS_LOOK: Record<string, { bg: string; fg: string }> = {
  PAID: { bg: color.ok.bg, fg: color.ok.fg },
  PART_PAID: { bg: color.warn.bg, fg: color.warn.fg },
  TO_PAY: { bg: color.info.bg, fg: color.info.fg },
};

/** Before anybody is on payroll: what payroll is here, in three steps, and the first one to take. */
export function PayrollSetup({ onAdd }: { onAdd: () => void }) {
  const steps = [
    { icon: "account-plus-outline" as const, t: "Add your team", d: "Name, job, monthly salary and the day they started." },
    { icon: "calendar-check-outline" as const, t: "Review each month", d: "Salary by the days worked, plus bonus, less deduction. Advances are taken off." },
    { icon: "cash-multiple" as const, t: "Pay and print payslips", d: "Pay everyone in one go — cash, bKash, Nagad or bank — and print payslips." },
  ];
  return (
    <Card title="Set up payroll in three steps">
      <View style={styles.gap}>
        <Text step="small" tone="muted">
          Nobody is on payroll yet. Once your team is in, every month is a pay run: review, pay, payslips.
        </Text>
        {steps.map((s, i) => (
          <View key={s.t} style={styles.setupStep}>
            <View style={styles.stepNo}>
              <Text step="small" weight="bold" tone="onBrand">
                {String(i + 1)}
              </Text>
            </View>
            <View style={styles.flex}>
              <Text step="body" weight="bold" tone="title">
                {s.t}
              </Text>
              <Text step="small" tone="muted">
                {s.d}
              </Text>
            </View>
            <MaterialCommunityIcons name={s.icon} size={22} color={color.ink[400]} />
          </View>
        ))}
        <Button label="Add the first person" onPress={onAdd} />
      </View>
    </Card>
  );
}

/** People exist, but none were on payroll in this month — say why. */
export function NobodyThisMonth({ month, people, onTeam }: { month: string; people: { name: string; joinDate: string | null; leftDate: string | null }[]; onTeam: () => void }) {
  const later = people.filter((p) => p.joinDate && p.joinDate.slice(0, 7) > month);
  const gone = people.filter((p) => p.leftDate && p.leftDate.slice(0, 7) < month);
  return (
    <Card>
      <View style={styles.nobody}>
        <View style={styles.nobodyIcon}>
          <MaterialCommunityIcons name="account-group-outline" size={28} color={color.ink[400]} />
        </View>
        <Text step="body" weight="bold" tone="title">{`Nobody was on payroll in ${monthName(month)}`}</Text>
        <Text step="small" tone="muted" style={styles.centred}>
          {`${later.length ? `${later.map((p) => p.name).join(", ")} joined later. ` : ""}${gone.length ? `${gone.map((p) => p.name).join(", ")} had left. ` : ""}A month counts the people whose dates cover it.`}
        </Text>
        <Button label="See the team" kind="ghost" block={false} onPress={onTeam} />
      </View>
    </Card>
  );
}

/** The month's pay run: where it stands, the sum, and the next thing to do. */
export function PayRunCard({ run, a, sheet, methods, whole }: { run: PayRun; a: PayrollAdapter; sheet: PayrollSheet; methods: PayMethod[]; whole: (n: number) => string }) {
  const [paying, setPaying] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const look = STATUS_LOOK[run.status] ?? { bg: color.ink[100], fg: color.muted };
  const lines: { label: string; value: number; sign: string; strong?: boolean }[] = [
    { label: "Gross pay", value: run.gross, sign: "" },
    { label: "Bonuses", value: run.bonus, sign: "+" },
    { label: "Deductions", value: run.deduction, sign: "−" },
    { label: "Net pay", value: run.net, sign: "=", strong: true },
    { label: "Already paid", value: run.paid, sign: "−" },
    { label: "To pay now", value: run.toPay, sign: "=", strong: true },
  ];

  async function payslips() {
    try {
      await Print.printAsync({ html: payslipHtml(a.ownerName, run.month, sheet.rows, whole) });
    } catch (error) {
      setSaid({ ok: false, text: refusal(error) });
    }
  }

  return (
    <Card>
      <View style={styles.gap}>
        <View style={styles.head}>
          <Text step="title" weight="bold" tone="title" style={styles.flex} numberOfLines={1}>
            {`${monthName(run.month)} payroll`}
          </Text>
          <View style={[styles.status, { backgroundColor: look.bg }]}>
            <Text step="caption" weight="bold" style={{ color: look.fg }}>
              {PAY_RUN_STATUS_LABEL[run.status]}
            </Text>
          </View>
        </View>
        <Text step="caption" tone="muted">
          {`Pay period ${day(run.period.from)} – ${day(run.period.to)} · payday ${day(run.payday)} · ${run.headcount} ${run.headcount === 1 ? "person" : "people"}`}
        </Text>

        <View style={styles.steps}>
          {PAY_RUN_STEPS.map((s, i) => {
            const done = i < run.step || run.status === "PAID";
            const here = i === run.step && run.status !== "PAID";
            return (
              <View key={s} style={[styles.step, here ? styles.stepHere : done ? styles.stepDone : null]} accessible accessibilityLabel={`${s}${done ? ", done" : here ? ", now" : ""}`}>
                <View style={[styles.stepDot, here ? styles.stepDotHere : done ? styles.stepDotDone : null]}>
                  {done ? (
                    <MaterialCommunityIcons name="check" size={12} color={color.surface} />
                  ) : (
                    <Text step="caption" weight="bold" style={{ color: here ? color.ink[900] : color.muted }}>
                      {String(i + 1)}
                    </Text>
                  )}
                </View>
                <Text step="small" weight="bold" numberOfLines={1} style={{ color: here ? color.surface : done ? color.ok.fg : color.muted }}>
                  {s}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.sum}>
          {lines.map((l) => (
            <View key={l.label} style={[styles.sumCell, l.strong ? styles.sumStrong : null]} accessible accessibilityLabel={`${l.label}: ${whole(l.value)}`}>
              <Text step="caption" weight="medium" numberOfLines={1} style={{ color: l.strong ? color.ink[300] : color.muted }}>
                {`${l.sign ? `${l.sign} ` : ""}${l.label}`}
              </Text>
              <Text step="strong" weight="bold" tabular numberOfLines={1} style={{ color: l.strong ? color.surface : color.title }}>
                {whole(l.value)}
              </Text>
            </View>
          ))}
        </View>
        {run.advance > 0 ? <Text step="caption" tone="muted">{`Already paid includes ${whole(run.advance)} given as advances.`}</Text> : null}
        {run.arrears > 0 ? <Text step="caption" tone="danger">{`${whole(run.arrears)} is still due from earlier months.`}</Text> : null}
        {run.status === "UPCOMING" ? <Text step="caption" tone="muted">This month has not started. Pay it on or after the payday.</Text> : null}
        {said ? <Text step="small" tone={said.ok ? "ok" : "danger"}>{said.text}</Text> : null}

        {paying ? (
          <PayEveryone run={run} a={a} methods={methods} whole={whole} onDone={(text, ok) => { setPaying(false); setSaid({ ok, text }); }} onCancel={() => setPaying(false)} />
        ) : (
          <>
            {a.canManage && run.toPay > 0 && run.status !== "UPCOMING" ? <Button label={`Pay everyone ${whole(run.toPay)}`} onPress={() => setPaying(true)} /> : null}
            <Button label="Payslips for everyone" kind="ghost" onPress={() => void payslips()} />
          </>
        )}
      </View>
    </Card>
  );
}

/** Pay everybody who has something left, in one go — each settled as salary. */
function PayEveryone({ run, a, methods, whole, onDone, onCancel }: { run: PayRun; a: PayrollAdapter; methods: PayMethod[]; whole: (n: number) => string; onDone: (text: string, ok: boolean) => void; onCancel: () => void }) {
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(run.payable.map((p) => p.employeeId)));
  const [method, setMethod] = useState(methods[0]?.code ?? "CASH");
  const [busy, setBusy] = useState(false);
  const total = run.payable.filter((p) => chosen.has(p.employeeId)).reduce((s, p) => s + p.amount, 0);

  async function payAll() {
    setBusy(true);
    let done = 0;
    const failed: string[] = [];
    for (const p of run.payable.filter((x) => chosen.has(x.employeeId))) {
      try {
        await a.pay(p.employeeId, { month: run.month, kind: "SALARY", method });
        done += 1;
      } catch (error) {
        failed.push(`${p.name}: ${refusal(error)}`);
      }
    }
    setBusy(false);
    await a.invalidate();
    onDone(failed.length ? `Paid ${done}; not paid — ${failed.join("; ")}` : `${done} ${done === 1 ? "person" : "people"} paid for ${monthName(run.month)}`, failed.length === 0);
  }

  return (
    <View style={styles.payBox}>
      <Text step="small" weight="bold" tone="title">
        Who to pay
      </Text>
      {run.payable.map((p) => {
        const on = chosen.has(p.employeeId);
        return (
          <Chip
            key={p.employeeId}
            label={`${p.name} · ${whole(p.amount)}`}
            on={on}
            onPress={() => {
              const next = new Set(chosen);
              if (on) next.delete(p.employeeId);
              else next.add(p.employeeId);
              setChosen(next);
            }}
          />
        );
      })}
      <Text step="small" weight="bold" tone="title">
        Paid by
      </Text>
      <View style={styles.chips}>
        {methods.map((m) => (
          <Chip key={m.code} label={m.label} on={method === m.code} onPress={() => setMethod(m.code)} />
        ))}
      </View>
      <Button label={`Pay ${chosen.size} · ${whole(total)}`} loading={busy} disabled={chosen.size === 0} onPress={() => void payAll()} />
      <Button label="Cancel" kind="ghost" onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.md },
  flex: { flex: 1 },
  centred: { textAlign: "center" },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  status: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill },
  steps: { flexDirection: "row", gap: space.xs },
  step: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.sm, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: color.ink[50] },
  stepHere: { backgroundColor: color.ink[900] },
  stepDone: { backgroundColor: color.ok.bg },
  stepDot: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: color.ink[200] },
  stepDotHere: { backgroundColor: color.surface },
  stepDotDone: { backgroundColor: color.ok.fg },
  sum: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  sumCell: { flexBasis: "47%", flexGrow: 1, padding: space.md, borderRadius: radius.lg, backgroundColor: color.ink[50], gap: 2 },
  sumStrong: { backgroundColor: color.ink[900] },
  payBox: { gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: color.ink[50] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  setupStep: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: color.ink[50] },
  stepNo: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: color.ink[900] },
  nobody: { alignItems: "center", gap: space.sm, paddingVertical: space.lg },
  nobodyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: color.ink[100], alignItems: "center", justifyContent: "center" },
});
