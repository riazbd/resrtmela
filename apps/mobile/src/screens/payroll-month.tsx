/**
 * A month of payroll on the phone: what it is worth, what has gone, what is
 * left — everyone together, then person by person.
 *
 * Drawn once for both owners; the resort and the agency differ only in which
 * calls they make (`PayrollAdapter`). The console draws the same month from
 * the same sheet (`apps/web/src/components/payroll/month-tab.tsx`).
 *
 * **Each row says why.** What the month is worth to this person — the days
 * they were on payroll, a bonus, a deduction — how much of it has been handed
 * over and how much of that was early, and what is left, with anything
 * earlier months still have beside it. The owner was being asked these
 * questions; the row answers them.
 *
 * **Five acts, each named.** Pay settles the month with what is left and
 * carries no amount — the server works it out. Advance and Pay part need an
 * amount. Bonus raises what the month is worth and Deduction lowers it; they
 * hand nothing over.
 */
import { useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, View } from "react-native";
import * as Print from "expo-print";
import {
  PAYROLL_MONTH_STATES,
  PAYROLL_MONTH_STATE_LABELS,
  PAYROLL_PAYMENT_LABELS,
  dayLabel,
  isPayrollPaymentKind,
  payslipHtml,
  percentOf,
  type PayrollLogin,
  type PayrollMonthState,
  type PayrollSheet,
} from "@rh/shared";
import { Button } from "../design/button";
import { Chip } from "../design/chip";
import { Kpi, SplitBar } from "../design/charts";
import { Field, Input } from "../design/input";
import { Empty } from "../design/states";
import { Card } from "../design/surface";
import { Text } from "../design/text";
import { useAction } from "../design/use-action";
import { color, radius, space } from "../design/tokens";
import type { PayrollAdapter } from "./payroll-adapter";

export interface PayMethod {
  code: string;
  label: string;
}

/**
 * The methods an agency pays with — the console's list for the same screen.
 * A resort reads its own from its options; an agency has no options table.
 */
export const AGENCY_PAY_METHODS: PayMethod[] = [
  { code: "CASH", label: "Cash" },
  { code: "BKASH", label: "bKash" },
  { code: "NAGAD", label: "Nagad" },
  { code: "BANK", label: "Bank" },
  { code: "CARD", label: "Card" },
];

type Row = PayrollSheet["rows"][number];

const tone = color.chart.money;

export const refusal = (error: unknown) => (error instanceof Error ? error.message : "That did not go through.");

/**
 * Asks once, with the act on the button, and does it only on a yes.
 *
 * react-native-web's `Alert.alert` is an empty function, so in the browser
 * lens the question was never asked and the act never happened.
 */
export function ask(title: string, message: string, act: string, then: () => void) {
  if (Platform.OS === "web") {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) then();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: act, style: "destructive", onPress: then },
  ]);
}

export function Refused({ said }: { said: string | null }) {
  if (!said) return null;
  return (
    <View style={styles.refused}>
      <Text step="small" tone="danger" weight="medium">
        {said}
      </Text>
    </View>
  );
}

const isState = (s: string): s is PayrollMonthState => (PAYROLL_MONTH_STATES as readonly string[]).includes(s);

/** Paid, Part paid, Unpaid…: the same colour and word as the year grid. */
export function StatePill({ state }: { state: string }) {
  const t = color.chart.payrollState[state] ?? color.chart.payrollState.UPCOMING!;
  const label = isState(state) ? PAYROLL_MONTH_STATE_LABELS[state].label : state;
  const quiet = state === "UPCOMING" || state === "NOT_ON_PAYROLL";
  return (
    <View style={[styles.pill, { backgroundColor: t.soft }]}>
      <View style={[styles.dot, { backgroundColor: t.solid }]} />
      <Text step="caption" weight="bold" style={{ color: quiet ? color.muted : t.solid }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Who they sign in as, or plainly that they do not — never silent. */
export function LoginChip({ login }: { login: PayrollLogin | null }) {
  return (
    <View style={[styles.login, login ? styles.loginOn : null]}>
      <Text step="caption" tone={login ? "body" : "muted"} numberOfLines={1}>
        {login ? `App login: ${login.name} · ${login.role}` : "No app login"}
      </Text>
    </View>
  );
}

export function PayrollFigures({ sheet, whole }: { sheet: PayrollSheet; whole: (n: number) => string }) {
  const t = sheet.totals;
  const salaryPaid = Math.max(0, t.paid - t.advance);
  return (
    <View style={styles.gap}>
      <View style={styles.figures}>
        <Kpi label="The month is worth" value={whole(t.expected)} tint={color.title} sub={`${t.headcount} on payroll`} />
        <Kpi label="Handed over" value={whole(t.paid)} tint={tone.paid.solid} sub={`${t.settledCount} of ${t.headcount} fully paid`} />
        <Kpi label="Advances in it" value={whole(t.advance)} tint={tone.advance.solid} sub="taken before settling" />
        <Kpi
          label="Still to pay"
          value={whole(t.remaining)}
          tint={t.remaining > 0 ? color.warn.fg : tone.paid.solid}
          sub={t.arrears > 0 ? `+ ${whole(t.arrears)} from earlier months` : "earlier months are clear"}
        />
      </View>
      {t.expected > 0 ? (
        <Card title="Where the month stands">
          <SplitBar
            total={t.expected}
            format={whole}
            parts={[
              { label: "Salary paid", value: salaryPaid, color: tone.paid.solid },
              { label: "Advances", value: t.advance, color: tone.advance.solid },
              { label: "Still to pay", value: t.remaining, color: tone.left.solid },
            ]}
          />
        </Card>
      ) : null}
    </View>
  );
}

type Act = "ADVANCE" | "PART" | "BONUS" | "DEDUCTION";

const ACT: Record<Act, { button: string; hint: string }> = {
  ADVANCE: { button: "Give the advance", hint: "Handed over now, before the month is settled" },
  PART: { button: "Pay this much", hint: "Part of what is left, handed over now" },
  BONUS: { button: "Add the bonus", hint: "Raises what the month is worth" },
  DEDUCTION: { button: "Take it off", hint: "Lowers what the month is worth" },
};

export function PayrollMonth({
  a,
  sheet,
  month,
  monthName,
  methods,
  whole,
}: {
  a: PayrollAdapter;
  sheet: PayrollSheet;
  month: string;
  /** "September 2026" */
  monthName: string;
  methods: PayMethod[];
  whole: (n: number) => string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [acting, setActing] = useState<Act | null>(null);
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [method, setMethod] = useState(methods[0]?.code ?? "CASH");
  const [refused, setRefused] = useState<string | null>(null);
  const mayManage = a.canManage;

  const methodLabel = (code: string | null) => (code ? (methods.find((m) => m.code === code)?.label ?? code) : null);

  function choose(employeeId: number) {
    setOpen(open === employeeId ? null : employeeId);
    setActing(null);
    setAmount(0);
    setNote("");
    setRefused(null);
  }

  const settle = useAction(async () => {
    if (open === null) return;
    setRefused(null);
    try {
      await a.pay(open, { month, kind: "SALARY", method });
      setOpen(null);
      await a.invalidate();
    } catch (error) {
      setRefused(refusal(error));
    }
  });

  const record = useAction(async () => {
    if (open === null || acting === null) return;
    if (!(amount > 0)) {
      setRefused("Put in the amount.");
      return;
    }
    setRefused(null);
    const why = note.trim() || undefined;
    try {
      if (acting === "ADVANCE" || acting === "PART") {
        await a.pay(open, { month, kind: acting === "ADVANCE" ? "ADVANCE" : "SALARY", amount, method, note: why });
      } else {
        await a.adjust(open, { month, kind: acting, amount, note: why });
      }
      setActing(null);
      setAmount(0);
      setNote("");
      await a.invalidate();
    } catch (error) {
      setRefused(refusal(error));
    }
  });

  function takeBack(what: "payment" | "adjustment", id: number, label: string) {
    ask(`Undo this ${label}?`, "It comes off the month, and the month's figures with it.", "Undo", () => {
      void (async () => {
        try {
          if (what === "payment") await a.undoPay(id);
          else await a.unadjust(id);
          await a.invalidate();
        } catch (error) {
          setRefused(refusal(error));
        }
      })();
    });
  }

  const payslip = useAction(async () => {
    const row = sheet.rows.find((r) => r.employeeId === open);
    if (!row) return;
    const html = payslipHtml(a.ownerName, month, [row], whole);
    try {
      await Print.printAsync({ html });
    } catch (error) {
      setRefused(refusal(error));
    }
  });

  const chosen: Row | undefined = sheet.rows.find((r) => r.employeeId === open);

  const line = (label: string, value: string, t: "body" | "muted" | "ok" | "warn" | "danger" | "title" = "body") => (
    <View style={styles.line} key={label}>
      <Text step="small" tone={t === "title" ? "title" : "muted"} weight={t === "title" ? "bold" : "regular"} style={styles.flex}>
        {label}
      </Text>
      <Text step="small" tone={t} weight="bold" tabular>
        {value}
      </Text>
    </View>
  );

  const detail = chosen ? (
    <View style={styles.detail}>
      <View style={styles.sum}>
        {line(
          chosen.days < chosen.daysInMonth ? `Salary, ${chosen.days} of ${chosen.daysInMonth} days` : "Salary",
          whole(chosen.base),
        )}
        {chosen.bonus > 0 ? line("Bonus", `+ ${whole(chosen.bonus)}`, "ok") : null}
        {chosen.deduction > 0 ? line("Deduction", `− ${whole(chosen.deduction)}`) : null}
        {line("The month is worth", whole(chosen.due), "title")}
        {line("Handed over", whole(chosen.paid), "ok")}
        {chosen.aheadUsed > 0 ? line("Paid ahead earlier, used here", whole(chosen.aheadUsed), "ok") : null}
        {line("Left", whole(chosen.remaining), chosen.remaining > 0 ? "warn" : "ok")}
        {chosen.over > 0 ? line("Paid beyond the month, carried to the next", whole(chosen.over)) : null}
        {chosen.arrears > 0 ? line("Still to pay from earlier months", whole(chosen.arrears), "danger") : null}
      </View>

      {/* every payment, not just the last: an advance the owner has
          forgotten is the number they came here to find */}
      {chosen.payments.length === 0 ? (
        <Text step="small" tone="muted">
          Nothing handed over this month yet.
        </Text>
      ) : (
        chosen.payments.map((p) => {
          const label = isPayrollPaymentKind(p.kind) ? PAYROLL_PAYMENT_LABELS[p.kind] : p.kind;
          const when = dayLabel(String(p.paidAt));
          return (
            <View key={p.id} style={styles.payment}>
              <View style={styles.flex}>
                <Text step="body" weight="medium" style={{ color: p.kind === "ADVANCE" ? tone.advance.solid : color.title }} tabular>
                  {`${label} · ${whole(p.amount)}`}
                </Text>
                <Text step="caption" tone="muted" numberOfLines={2}>
                  {[when, methodLabel(p.method), p.note].filter(Boolean).join(" · ")}
                </Text>
              </View>
              {mayManage ? (
                <Button
                  label="Undo"
                  kind="subtle"
                  block={false}
                  accessibilityLabel={`Undo the ${whole(p.amount)} ${label.toLowerCase()} of ${when}`}
                  onPress={() => takeBack("payment", p.id, label.toLowerCase())}
                />
              ) : null}
            </View>
          );
        })
      )}
      {chosen.adjustments.map((x) => {
        const label = x.kind === "BONUS" ? "Bonus" : "Deduction";
        return (
          <View key={`adj-${x.id}`} style={styles.payment}>
            <View style={styles.flex}>
              <Text step="body" weight="medium" style={{ color: x.kind === "BONUS" ? tone.bonus.solid : color.body }} tabular>
                {`${label} · ${x.kind === "BONUS" ? "+" : "−"} ${whole(x.amount)}`}
              </Text>
              {x.note ? (
                <Text step="caption" tone="muted" numberOfLines={2}>
                  {x.note}
                </Text>
              ) : null}
            </View>
            {mayManage ? (
              <Button
                label="Undo"
                kind="subtle"
                block={false}
                accessibilityLabel={`Undo the ${whole(x.amount)} ${label.toLowerCase()}`}
                onPress={() => takeBack("adjustment", x.id, label.toLowerCase())}
              />
            ) : null}
          </View>
        );
      })}

      {mayManage && acting ? (
        <>
          {acting === "ADVANCE" || acting === "PART" ? (
            <View style={styles.kinds}>
              {methods.map((m) => (
                <Chip key={m.code} label={m.label} on={method === m.code} onPress={() => setMethod(m.code)} />
              ))}
            </View>
          ) : null}
          <Field label="How much?" hint={acting === "PART" ? `${whole(chosen.remaining)} is left` : ACT[acting].hint}>
            <Input
              value={amount ? String(amount) : ""}
              onChangeText={(text) => setAmount(Number(text.replace(/[^0-9.]/g, "")) || 0)}
              placeholder="0"
              keyboardType="numeric"
            />
          </Field>
          <Field label={acting === "DEDUCTION" ? "Why?" : "What for?"} hint="Optional">
            <Input value={note} onChangeText={setNote} placeholder={acting === "DEDUCTION" ? "A fine, a loan paid back…" : "Medicine, Eid…"} />
          </Field>
          <Refused said={refused} />
          <Button label={`${ACT[acting].button}${amount ? ` · ${whole(amount)}` : ""}`} loading={record.busy} onPress={record.go} />
          <Button label="Not now" kind="ghost" onPress={() => setActing(null)} />
        </>
      ) : (
        <>
          <Refused said={refused} />
          {mayManage ? (
            <>
              {chosen.remaining > 0 ? (
                <>
                  <View style={styles.kinds}>
                    {methods.map((m) => (
                      <Chip key={m.code} label={m.label} on={method === m.code} onPress={() => setMethod(m.code)} />
                    ))}
                  </View>
                  <Button label={`Pay ${whole(chosen.remaining)}`} loading={settle.busy} onPress={settle.go} />
                </>
              ) : null}
              <View style={styles.acts}>
                <Chip label="Advance" on={false} onPress={() => setActing("ADVANCE")} />
                {chosen.remaining > 0 ? <Chip label="Pay part" on={false} onPress={() => setActing("PART")} /> : null}
                <Chip label="Bonus" on={false} onPress={() => setActing("BONUS")} />
                <Chip label="Deduction" on={false} onPress={() => setActing("DEDUCTION")} />
              </View>
            </>
          ) : null}
          <Button label="Payslip" kind="ghost" loading={payslip.busy} onPress={payslip.go} />
        </>
      )}
    </View>
  ) : null;

  return (
    <Card title={`Review each person — ${monthName}`}>
      {sheet.rows.length === 0 ? (
        <View style={styles.emptyBox}>
          <Empty icon="account-group-outline" message="Nobody on payroll this month" hint="Add people under People." />
        </View>
      ) : (
        sheet.rows.map((row, i) => {
          const last = i === sheet.rows.length - 1;
          const isOpen = open === row.employeeId;
          const pctPaid = Math.min(100, percentOf(row.paid - row.advance, row.due));
          const pctAdv = Math.min(100 - pctPaid, percentOf(row.advance + row.aheadUsed, row.due));
          return (
            <View key={row.employeeId} style={last && !isOpen ? null : styles.ruled}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${row.name}, worth ${whole(row.due)}, handed over ${whole(row.paid)}, ${
                  row.remaining > 0 ? `${whole(row.remaining)} left` : "fully paid"
                }`}
                onPress={() => choose(row.employeeId)}
                style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
              >
                <View style={styles.rowHead}>
                  <View style={styles.flex}>
                    <Text step="body" weight="medium" tone="title" numberOfLines={1}>
                      {row.name}
                    </Text>
                    <Text step="caption" tone="muted" numberOfLines={1}>
                      {[
                        row.designation,
                        row.days < row.daysInMonth ? `${row.days} of ${row.daysInMonth} days` : null,
                        row.bonus > 0 ? `bonus ${whole(row.bonus)}` : null,
                        row.deduction > 0 ? `deduction ${whole(row.deduction)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || " "}
                    </Text>
                  </View>
                  <View style={styles.right}>
                    <Text step="body" weight="bold" tone={row.remaining > 0 ? "warn" : "ok"} tabular>
                      {row.remaining > 0 ? whole(row.remaining) : "Paid"}
                    </Text>
                    <StatePill state={row.state} />
                  </View>
                </View>
                <View style={styles.progress}>
                  <View style={{ width: `${pctPaid}%`, backgroundColor: tone.paid.solid }} />
                  <View style={{ width: `${pctAdv}%`, backgroundColor: tone.advance.solid }} />
                </View>
                <View style={styles.rowFoot}>
                  <Text step="caption" tone="muted" tabular style={styles.flex} numberOfLines={1}>
                    {`${whole(row.paid)} of ${whole(row.due)}${row.advance > 0 ? ` · ${whole(row.advance)} advance` : ""}`}
                  </Text>
                  <LoginChip login={row.login} />
                </View>
                {row.arrears > 0 ? (
                  <Text step="caption" tone="danger" weight="medium">
                    {`+ ${whole(row.arrears)} still to pay from earlier months`}
                  </Text>
                ) : null}
              </Pressable>
              {isOpen ? detail : null}
            </View>
          );
        })
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.lg },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  row: { paddingVertical: space.md, gap: space.xs },
  pressed: { opacity: 0.6 },
  rowHead: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  right: { alignItems: "flex-end", gap: 4 },
  rowFoot: { flexDirection: "row", alignItems: "center", gap: space.sm },
  progress: {
    height: 6,
    flexDirection: "row",
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: color.ink[100],
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  login: {
    paddingHorizontal: space.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.line,
    maxWidth: "60%",
  },
  loginOn: { backgroundColor: color.info.bg, borderColor: color.info.line },
  detail: { gap: space.md, paddingBottom: space.md },
  sum: {
    backgroundColor: color.ink[50],
    borderRadius: radius.md,
    padding: space.md,
    gap: 4,
  },
  line: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  ruled: { borderBottomWidth: 1, borderBottomColor: color.line },
  kinds: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  acts: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  emptyBox: { paddingVertical: space.lg },
  payment: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.xs },
  refused: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.md,
    padding: space.md,
  },
});
