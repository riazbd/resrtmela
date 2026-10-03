/**
 * Payroll's people, beside the app's logins — on the phone.
 *
 * Two lists that mostly overlap: who is paid a salary, and who can sign in.
 * Everyone on payroll shows the login they use or plainly none; the logins
 * nobody has put on payroll are listed after, each a tap from being added;
 * anybody who has left is kept at the bottom with the day they left.
 */
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { monthName, type PayrollPeople, type PayrollPerson } from "@rh/shared";
import { Button } from "../design/button";
import { Chip } from "../design/chip";
import { Field, Input } from "../design/input";
import { Empty } from "../design/states";
import { Card, Row } from "../design/surface";
import { Text } from "../design/text";
import { useAction } from "../design/use-action";
import { space } from "../design/tokens";
import type { PayrollAdapter } from "./payroll-adapter";
import { LoginChip, Refused, ask, refusal } from "./payroll-month";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const dayName = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;

type Draft = {
  id?: number;
  name: string;
  phone: string;
  designation: string;
  salary: string;
  joinDate: string;
  leftDate: string;
  userId: number;
};

const blank = (today: string): Draft => ({
  name: "",
  phone: "",
  designation: "",
  salary: "",
  joinDate: today,
  leftDate: "",
  userId: 0,
});

export function PayrollPeopleView({
  a,
  people,
  whole,
  today,
}: {
  a: PayrollAdapter;
  people: PayrollPeople;
  whole: (n: number) => string;
  /** "YYYY-MM-DD" where the payroll is kept */
  today: string;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const current = people.people.filter((p) => p.active);
  const former = people.people.filter((p) => !p.active);
  const monthly = current.reduce((s, p) => s + p.salary, 0);
  const set = (key: keyof Draft) => (text: string) => setDraft((d) => (d ? { ...d, [key]: text } : d));

  function edit(p: PayrollPerson) {
    setRefused(null);
    setDraft({
      id: p.id,
      name: p.name,
      phone: p.phone ?? "",
      designation: p.designation ?? "",
      salary: String(p.salary),
      joinDate: p.joinDate ?? "",
      leftDate: p.leftDate ?? "",
      userId: p.login?.userId ?? 0,
    });
  }

  const save = useAction(async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      setRefused("Who is it? A name is needed.");
      return;
    }
    for (const [what, value] of [
      ["The joining date", draft.joinDate],
      ["The leaving date", draft.leftDate],
    ] as const) {
      if (value && !DAY.test(value)) {
        setRefused(`${what} must look like ${today}.`);
        return;
      }
    }
    setRefused(null);
    const body = {
      name: draft.name.trim(),
      phone: draft.phone.trim(),
      designation: draft.designation.trim(),
      salary: Number(draft.salary.replace(/[^0-9.]/g, "")) || 0,
    };
    try {
      if (draft.id) {
        await a.editEmployee(draft.id, { ...body, joinDate: draft.joinDate, leftDate: draft.leftDate, userId: draft.userId });
      } else {
        await a.addEmployee({ ...body, joinDate: draft.joinDate || undefined, userId: draft.userId || undefined });
      }
      setDraft(null);
      await a.invalidate();
    } catch (error) {
      setRefused(refusal(error));
    }
  });

  function takeOff(p: PayrollPerson) {
    const on = draft?.leftDate && DAY.test(draft.leftDate) ? draft.leftDate : today;
    ask(
      `${p.name} has left?`,
      `Off payroll after ${dayName(on)}. That month is paid for the days up to it, and everything already paid stays on the books.`,
      "Take off payroll",
      () => {
        void (async () => {
          try {
            await a.removeEmployee(p.id, on);
            setDraft(null);
            await a.invalidate();
          } catch (error) {
            setRefused(refusal(error));
          }
        })();
      },
    );
  }

  async function rejoin(p: PayrollPerson) {
    try {
      await a.editEmployee(p.id, { active: true });
      await a.invalidate();
    } catch (error) {
      setRefused(refusal(error));
    }
  }

  const linked = draft?.id ? people.people.find((p) => p.id === draft.id)?.login : null;
  const loginChoices = [...(linked ? [{ userId: linked.userId, name: linked.name, role: linked.role }] : []), ...people.team];

  const form = draft ? (
    <View style={styles.form}>
      <Field label="Name">
        <Input value={draft.name} onChangeText={set("name")} />
      </Field>
      <Field label="Designation">
        <Input value={draft.designation} onChangeText={set("designation")} placeholder="Cook, Guard, Front desk" />
      </Field>
      <Field label="Monthly salary">
        <Input value={draft.salary} onChangeText={set("salary")} placeholder="0" keyboardType="numeric" />
      </Field>
      <Field label="Phone" hint="Optional">
        <Input value={draft.phone} onChangeText={set("phone")} keyboardType="phone-pad" />
      </Field>
      <Field label="Joined" hint="The first month is paid for the days from here">
        <Input value={draft.joinDate} onChangeText={set("joinDate")} placeholder={today} />
      </Field>
      {draft.id ? (
        <Field label="Left" hint="Empty while they still work here">
          <Input value={draft.leftDate} onChangeText={set("leftDate")} placeholder={today} />
        </Field>
      ) : null}
      <Text step="small" weight="medium" tone="title">
        App login
      </Text>
      <View style={styles.chips}>
        <Chip label="No app login" on={!draft.userId} onPress={() => setDraft({ ...draft, userId: 0 })} />
        {loginChoices.map((l) => (
          <Chip key={l.userId} label={`${l.name} · ${l.role}`} on={draft.userId === l.userId} onPress={() => setDraft({ ...draft, userId: l.userId })} />
        ))}
      </View>
      <Refused said={refused} />
      <Button label={draft.id ? "Save" : "Put on payroll"} loading={save.busy} onPress={save.go} />
      {draft.id ? (
        <Button
          label="Has left — take off payroll"
          kind="danger"
          onPress={() => {
            const p = people.people.find((x) => x.id === draft.id);
            if (p) takeOff(p);
          }}
        />
      ) : null}
      <Button label="Cancel" kind="ghost" onPress={() => setDraft(null)} />
    </View>
  ) : null;

  return (
    <View style={styles.gap}>
      <Card
        title={`On payroll (${current.length})`}
        action={
          a.canManage && !(draft && !draft.id) ? (
            <Button label="Add" kind="ghost" block={false} onPress={() => setDraft(blank(today))} />
          ) : null
        }
      >
        <Text step="small" tone="muted">
          {`${whole(monthly)} a month in salaries`}
        </Text>
        {draft && !draft.id ? form : null}
        {current.length === 0 && !(draft && !draft.id) ? (
          <View style={styles.emptyBox}>
            <Empty icon="account-group-outline" message="Nobody on payroll yet" />
          </View>
        ) : (
          current.map((p, i) => (
            <View key={p.id}>
              <Row
                title={p.name}
                subtitle={[p.designation, p.joinDate ? `joined ${dayName(p.joinDate)}` : `on the books since ${monthName(p.since)}`]
                  .filter(Boolean)
                  .join(" · ")}
                last={i === current.length - 1 && draft?.id !== p.id}
                accessibilityLabel={`${p.name}, ${whole(p.salary)} a month, ${p.login ? `signs in as ${p.login.name}` : "no app login"}`}
                onPress={a.canManage ? () => (draft?.id === p.id ? setDraft(null) : edit(p)) : undefined}
                right={
                  <View style={styles.right}>
                    <Text step="small" weight="bold" tone="title" tabular>
                      {whole(p.salary)}
                    </Text>
                    <LoginChip login={p.login} />
                  </View>
                }
              />
              {draft?.id === p.id ? form : null}
            </View>
          ))
        )}
      </Card>

      <Card title={`App logins not on payroll (${people.team.length})`}>
        <Text step="small" tone="muted">
          {`They can sign in to the app, but nobody has put them on payroll. If you pay them a salary, add them — it links their login too.${
            a.owner === "resort" ? " Agents are not listed: they earn commission." : ""
          }`}
        </Text>
        {people.team.length === 0 ? (
          <View style={styles.emptyBox}>
            <Empty message="Every login is on payroll" />
          </View>
        ) : (
          people.team.map((t, i) => (
            <Row
              key={t.userId}
              title={t.name}
              subtitle={t.role}
              last={i === people.team.length - 1}
              accessibilityLabel={`${t.name}, ${t.role}, not on payroll`}
              right={
                a.canManage ? (
                  <Button
                    label="Put on payroll"
                    kind="ghost"
                    block={false}
                    onPress={() =>
                      setDraft({
                        ...blank(today),
                        name: t.name,
                        phone: t.phone ?? "",
                        designation: t.role,
                        userId: t.userId,
                      })
                    }
                  />
                ) : undefined
              }
            />
          ))
        )}
      </Card>

      {former.length > 0 ? (
        <Card title={`Left (${former.length})`}>
          {former.map((p, i) => (
            <Row
              key={p.id}
              title={p.name}
              subtitle={[p.designation, p.leftDate ? `left ${dayName(p.leftDate)}` : "off payroll"].filter(Boolean).join(" · ")}
              last={i === former.length - 1}
              accessibilityLabel={`${p.name}, left`}
              right={
                a.canManage ? <Button label="Back on payroll" kind="ghost" block={false} onPress={() => void rejoin(p)} /> : undefined
              }
            />
          ))}
        </Card>
      ) : null}
      {!draft ? <Refused said={refused} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.lg },
  form: { gap: space.md, paddingVertical: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  emptyBox: { paddingVertical: space.lg },
  right: { alignItems: "flex-end", gap: 4, maxWidth: 170 },
});
