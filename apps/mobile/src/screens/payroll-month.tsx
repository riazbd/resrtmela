/**
 * A month of payroll and the people on it, drawn once for both owners.
 *
 * The resort and the agency each have a payroll screen, and the console
 * already learned that they are one screen with two sets of routes
 * (`apps/web/src/components/payroll-month.tsx`). This is the phone's half of
 * the same argument: what each screen keeps is which calls it makes.
 *
 * **Pay and Advance are two different acts, and the screen says so.** The
 * phone used to have one: hand over an amount, under a hint promising that
 * "less than what is left is an advance". The payment went up with no `kind`,
 * the server defaults that to SALARY, and a cook's 2,000 on the 8th sat on the
 * console's sheet as salary. Now Pay settles the month and carries no amount —
 * the server works out what is left, which after a 6,000 advance on an 18,000
 * wage is 12,000 — and Advance needs an amount, because "give him some money"
 * has no number to invent for it.
 *
 * **An advance can be given on a settled month.** Money against the month
 * still to come is ordinary, and the console allows it.
 *
 * **The people are here too.** They used to "stay on the desk" as "a decision
 * with a contract behind them", and the result was an owner holding a phone
 * that said "Nobody on payroll" with nothing to press. Adding somebody is a
 * name and a number; it is not harder on a phone than a booking is.
 */
import { useState } from "react";
import { Alert, Platform, StyleSheet, View } from "react-native";
import {
  PAYROLL_PAYMENT_LABELS,
  dayLabel,
  isPayrollPaymentKind,
  type EmployeeEdit,
  type PayrollPay,
  type PayrollSheet,
} from "@rh/shared";
import { Button } from "../design/button";
import { Chip } from "../design/chip";
import { Field, Input } from "../design/input";
import { Empty } from "../design/states";
import { Card, Row, Stat } from "../design/surface";
import { Text } from "../design/text";
import { useAction } from "../design/use-action";
import { color, radius, space } from "../design/tokens";

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

const refusal = (error: unknown) =>
  error instanceof Error ? error.message : "That did not go through.";

/**
 * Asks once, with the act on the button, and does it only on a yes.
 *
 * react-native-web's `Alert.alert` is an empty function, so in the browser
 * lens the question was never asked and the act never happened.
 */
function ask(title: string, message: string, act: string, then: () => void) {
  if (Platform.OS === "web") {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) then();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: act, style: "destructive", onPress: then },
  ]);
}

function Refused({ said }: { said: string | null }) {
  if (!said) return null;
  return (
    <View style={styles.refused}>
      <Text step="small" tone="danger" weight="medium">
        {said}
      </Text>
    </View>
  );
}

export function PayrollFigures({
  sheet,
  whole,
}: {
  sheet: PayrollSheet;
  whole: (n: number) => string;
}) {
  const { totals } = sheet;
  return (
    <View style={styles.figures}>
      <Stat label="Due" value={whole(totals.expected)} />
      {/* apart from Paid: the owner's question is not "what have we paid"
          but "what did we hand out early" */}
      <Stat label="Advances" value={whole(totals.advance)} />
      <Stat label="Paid" value={whole(totals.paid)} tone="ok" />
      <Stat
        label="Left"
        value={whole(totals.remaining)}
        tone={totals.remaining > 0 ? "danger" : "title"}
      />
    </View>
  );
}

export function PayrollMonth({
  sheet,
  month,
  monthName,
  mayManage,
  methods,
  whole,
  pay,
  undo,
  onDone,
}: {
  sheet: PayrollSheet;
  month: string;
  /** "September", for the button that settles it */
  monthName: string;
  mayManage: boolean;
  methods: PayMethod[];
  whole: (n: number) => string;
  pay: (employeeId: number, body: PayrollPay) => Promise<unknown>;
  undo: (paymentId: number) => Promise<unknown>;
  onDone: () => Promise<unknown> | void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [method, setMethod] = useState(methods[0]?.code ?? "CASH");
  const [refused, setRefused] = useState<string | null>(null);

  const methodLabel = (code: string | null) =>
    code ? (methods.find((m) => m.code === code)?.label ?? code) : null;

  function choose(employeeId: number) {
    setOpen(open === employeeId ? null : employeeId);
    setAdvancing(false);
    setAmount(0);
    setNote("");
    setRefused(null);
  }

  const settle = useAction(async () => {
    if (open === null) return;
    setRefused(null);
    try {
      await pay(open, { month, kind: "SALARY", method });
      setOpen(null);
      await onDone();
    } catch (error) {
      setRefused(refusal(error));
    }
  });

  const advance = useAction(async () => {
    if (open === null) return;
    if (!(amount > 0)) {
      setRefused("How much is the advance?");
      return;
    }
    setRefused(null);
    try {
      const body: PayrollPay = { month, kind: "ADVANCE", amount, method };
      if (note.trim()) body.note = note.trim();
      await pay(open, body);
      setAdvancing(false);
      setAmount(0);
      setNote("");
      await onDone();
    } catch (error) {
      setRefused(refusal(error));
    }
  });

  function takeBack(paymentId: number, what: string) {
    ask(
      `Undo this ${what}?`,
      "It comes off the month, and the month's figures with it.",
      "Undo",
      () => {
        void (async () => {
          try {
            await undo(paymentId);
            await onDone();
          } catch (error) {
            setRefused(refusal(error));
          }
        })();
      },
    );
  }

  const chosen: Row | undefined = sheet.rows.find((r) => r.employeeId === open);

  // opened under the row it belongs to: below the whole list, a tap near
  // the top of a long one opened something off the bottom of the screen
  const detail = chosen ? (
    <View style={[styles.fields, styles.detail]}>
      <Text step="small" tone="muted" tabular>
        {`Salary ${whole(chosen.salary)} · taken ${whole(chosen.paid)} · ${
          chosen.settled ? "settled" : `${whole(chosen.remaining)} left`
        }`}
      </Text>

      {/* every payment, not just the last: an advance the owner has
          forgotten is the number they came here to find */}
      {chosen.payments.length === 0 ? (
        <Text step="small" tone="muted">
          Nothing handed over this month yet.
        </Text>
      ) : (
        chosen.payments.map((p) => {
          const label = isPayrollPaymentKind(p.kind)
            ? PAYROLL_PAYMENT_LABELS[p.kind]
            : p.kind;
          const when = dayLabel(p.paidAt);
          return (
            <View key={p.id} style={styles.payment}>
              <View style={styles.paymentText}>
                <Text
                  step="body"
                  weight="medium"
                  tone={p.kind === "ADVANCE" ? "warn" : "title"}
                  tabular
                >
                  {`${label} · ${whole(p.amount)}`}
                </Text>
                <Text step="caption" tone="muted" numberOfLines={2}>
                  {[when, methodLabel(p.method), p.note]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
              {mayManage ? (
                <Button
                  label="Undo"
                  kind="subtle"
                  block={false}
                  accessibilityLabel={`Undo the ${whole(p.amount)} ${label.toLowerCase()} of ${when}`}
                  onPress={() => takeBack(p.id, label.toLowerCase())}
                />
              ) : null}
            </View>
          );
        })
      )}

      {mayManage ? (
        <>
          {methods.length > 0 ? (
            <View style={styles.kinds}>
              {methods.map((m) => (
                <Chip
                  key={m.code}
                  label={m.label}
                  on={method === m.code}
                  onPress={() => setMethod(m.code)}
                />
              ))}
            </View>
          ) : null}

          {advancing ? (
            <>
              <Field
                label="How much?"
                hint={`Handed over now, against ${monthName}`}
              >
                <Input
                  value={amount ? String(amount) : ""}
                  onChangeText={(text) =>
                    setAmount(Number(text.replace(/[^0-9.]/g, "")) || 0)
                  }
                  placeholder="0"
                  keyboardType="numeric"
                />
              </Field>
              <Field label="What for?" hint="Optional">
                <Input
                  value={note}
                  onChangeText={setNote}
                  placeholder="Medicine, a wedding…"
                />
              </Field>
              <Refused said={refused} />
              <Button
                label={`Give ${whole(amount)} in advance`}
                loading={advance.busy}
                onPress={advance.go}
              />
              <Button
                label="Not now"
                kind="ghost"
                onPress={() => setAdvancing(false)}
              />
            </>
          ) : (
            <>
              <Refused said={refused} />
              {/* nothing to settle on a month already covered */}
              {!chosen.settled ? (
                <Button
                  label={`Pay ${whole(chosen.remaining)}`}
                  loading={settle.busy}
                  onPress={settle.go}
                />
              ) : null}
              <Button
                label="Advance"
                kind="ghost"
                onPress={() => {
                  setAdvancing(true);
                  setRefused(null);
                }}
              />
              <Text step="caption" tone="muted">
                {chosen.settled
                  ? `${monthName} is settled. An advance now is money against a month still to come.`
                  : `Pay settles ${monthName} with what is left. An advance is money handed over early.`}
              </Text>
            </>
          )}
        </>
      ) : (
        <Refused said={refused} />
      )}
    </View>
  ) : null;

  return (
    <>
      <Card title="The month">
        {sheet.rows.length === 0 ? (
          <View style={styles.emptyBox}>
            <Empty message="Nobody on payroll" />
          </View>
        ) : (
          sheet.rows.map((row, i) => (
            <View key={row.employeeId}>
              <Row
                title={row.name}
                subtitle={
                  [
                    row.designation,
                    // money already handed over changes how the month reads
                    row.advance > 0 ? `${whole(row.advance)} advanced` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || undefined
                }
                last={i === sheet.rows.length - 1 && open !== row.employeeId}
                accessibilityLabel={`${row.name}, salary ${whole(row.salary)}, ${
                  row.settled ? "settled" : `${whole(row.remaining)} left`
                }`}
                onPress={() => choose(row.employeeId)}
                right={
                  row.settled ? (
                    <Text step="small" weight="medium" tone="ok">
                      Settled
                    </Text>
                  ) : (
                    <Text step="body" weight="medium" tone="danger" tabular>
                      {whole(row.remaining)}
                    </Text>
                  )
                }
              />
              {open === row.employeeId ? (
                // a list does not end in a line
                <View style={i === sheet.rows.length - 1 ? null : styles.ruled}>{detail}</View>
              ) : null}
            </View>
          ))
        )}
      </Card>
    </>
  );
}

export interface PayrollPerson {
  id: number;
  name: string;
  phone: string | null;
  designation: string | null;
  salary: number;
  active: boolean;
}

type Draft = {
  name: string;
  phone: string;
  designation: string;
  salary: string;
};
const blank: Draft = { name: "", phone: "", designation: "", salary: "" };

export function PayrollStaff({
  people,
  mayManage,
  whole,
  add,
  edit,
  remove,
  onDone,
}: {
  people: PayrollPerson[];
  mayManage: boolean;
  whole: (n: number) => string;
  add: (
    body: Required<
      Pick<EmployeeEdit, "name" | "phone" | "designation" | "salary">
    >,
  ) => Promise<unknown>;
  edit: (
    id: number,
    body: Required<
      Pick<EmployeeEdit, "name" | "phone" | "designation" | "salary">
    >,
  ) => Promise<unknown>;
  remove: (id: number) => Promise<unknown>;
  onDone: () => Promise<unknown> | void;
}) {
  /** `"new"` is the add form, a number is somebody being edited, `null` is neither. */
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [refused, setRefused] = useState<string | null>(null);

  const active = people.filter((p) => p.active);
  const set = (key: keyof Draft) => (text: string) =>
    setDraft((d) => ({ ...d, [key]: text }));

  function start(target: number | "new") {
    setRefused(null);
    if (target === "new" || editing === target) {
      setEditing(editing === target ? null : target);
      setDraft(blank);
      return;
    }
    const person = people.find((p) => p.id === target);
    setEditing(target);
    setDraft({
      name: person?.name ?? "",
      phone: person?.phone ?? "",
      designation: person?.designation ?? "",
      salary: person ? String(person.salary) : "",
    });
  }

  const save = useAction(async () => {
    if (!draft.name.trim()) {
      setRefused("Who is it? A name is needed.");
      return;
    }
    setRefused(null);
    const body = {
      name: draft.name.trim(),
      phone: draft.phone.trim(),
      designation: draft.designation.trim(),
      salary: Number(draft.salary.replace(/[^0-9.]/g, "")) || 0,
    };
    try {
      if (editing === "new") await add(body);
      else if (editing !== null) await edit(editing, body);
      setEditing(null);
      setDraft(blank);
      await onDone();
    } catch (error) {
      setRefused(refusal(error));
    }
  });

  function takeOff(id: number, name: string) {
    ask(
      `Take ${name} off payroll?`,
      "What they have been paid stays on the books.",
      "Take off",
      () => {
        void (async () => {
          try {
            await remove(id);
            setEditing(null);
            await onDone();
          } catch (error) {
            setRefused(refusal(error));
          }
        })();
      },
    );
  }

  const form =
    editing !== null && mayManage ? (
      <View style={styles.form}>
        <Field label="Name">
          <Input value={draft.name} onChangeText={set("name")} />
        </Field>
        <Field label="Phone" hint="Optional">
          <Input
            value={draft.phone}
            onChangeText={set("phone")}
            keyboardType="phone-pad"
          />
        </Field>
        <Field label="Designation">
          <Input
            value={draft.designation}
            onChangeText={set("designation")}
            placeholder="Manager / Chef / Guard"
          />
        </Field>
        <Field label="Monthly salary">
          <Input
            value={draft.salary}
            onChangeText={set("salary")}
            placeholder="0"
            keyboardType="numeric"
          />
        </Field>
        <Refused said={refused} />
        <Button label="Save" loading={save.busy} onPress={save.go} />
        {typeof editing === "number" ? (
          <Button
            label="Take off payroll"
            kind="danger"
            onPress={() => takeOff(editing, draft.name || "them")}
          />
        ) : null}
        <Button label="Cancel" kind="ghost" onPress={() => setEditing(null)} />
      </View>
    ) : null;

  return (
    <Card
      title={`Staff (${active.length})`}
      action={
        mayManage && editing !== "new" ? (
          <Button
            label="Add staff"
            kind="ghost"
            block={false}
            onPress={() => start("new")}
          />
        ) : null
      }
    >
      {editing === "new" ? form : null}
      {active.length === 0 && editing !== "new" ? (
        <View style={styles.emptyBox}>
          <Empty message="No staff added yet" />
        </View>
      ) : (
        active.map((p, i) => (
          <View key={p.id}>
            <Row
              title={p.name}
              subtitle={
                [p.designation, p.phone].filter(Boolean).join(" · ") ||
                undefined
              }
              last={i === active.length - 1 && editing !== p.id}
              accessibilityLabel={`${p.name}, ${p.designation ? `${p.designation}, ` : ""}${whole(p.salary)} a month`}
              onPress={mayManage ? () => start(p.id) : undefined}
              right={
                <Text step="small" weight="medium" tone="body" tabular>
                  {whole(p.salary)}
                </Text>
              }
            />
            {editing === p.id ? form : null}
          </View>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  fields: { gap: space.md },
  detail: { paddingVertical: space.md },
  ruled: { borderBottomWidth: 1, borderBottomColor: color.line },
  form: { gap: space.md, paddingVertical: space.md },
  kinds: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  emptyBox: { paddingVertical: space.lg },
  payment: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.xs,
  },
  paymentText: { flex: 1, gap: 2 },
  refused: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.md,
    padding: space.md,
  },
});
