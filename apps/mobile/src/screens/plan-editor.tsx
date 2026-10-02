/**
 * A plan, edited on the phone — the console's PlanCard, NewPlanCard and
 * PlanLadder (`apps/web/src/app/(app)/platform/`). The same vocabularies drive
 * both: PLAN_FEATURES for the ticks, PERIOD_UNITS for the ladder, and
 * `phasesAreSane` / `scheduleSentence` for what is valid and what customers read.
 */
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { keys, useApi } from "@rh/app-core";
import {
  PERIOD_UNITS,
  PLAN_FEATURES,
  phasesAreSane,
  scheduleSentence,
  type NewPlan,
  type PeriodUnit,
  type Phase,
  type PlanDefinition,
  type PlanEdit,
  type PlanScheduleInput,
} from "@rh/shared";
import { client } from "../api/session";
import { Button } from "../design/button";
import { Chip } from "../design/chip";
import { Field, Input } from "../design/input";
import { Text } from "../design/text";
import { Toggle } from "../design/toggle";
import { color, radius, space } from "../design/tokens";
import { refusal } from "./payroll-month";

type PlanForm = Required<PlanEdit>;
interface Rung {
  count: number;
  unit: PeriodUnit;
  price: number;
  /** null is the last rung: forever. */
  repeats: number | null;
}
interface Shelf {
  label: string;
  active: boolean;
  phases: Rung[];
}

export const toEdit = (plan: PlanDefinition): PlanForm => ({
  label: plan.label,
  maxRooms: plan.maxRooms,
  maxResorts: plan.maxResorts,
  maxStaff: plan.maxStaff,
  trialDays: plan.trialDays,
  features: [...(plan.features ?? [])],
  blurb: plan.blurb ?? "",
  active: plan.active,
  sortOrder: plan.sortOrder,
  highlight: plan.highlight,
  audience: plan.audience ?? "RESORT",
});

export const asPhases = (rungs: Rung[]): Phase[] => rungs.map((r, i) => ({ seq: i + 1, ...r }));
const toShelves = (rows: PlanScheduleInput[]): Shelf[] =>
  rows.map((r) => ({ label: r.label, active: r.active ?? true, phases: r.phases.map((p) => ({ ...p, repeats: p.repeats ?? null })) }));
const whole = (t: string) => Number(t.replace(/[^0-9]/g, "")) || 0;

function NumBox({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <View style={styles.flex}>
      <Field label={label}>
        <Input value={String(value)} onChangeText={(t) => onChange(whole(t))} keyboardType="numeric" />
      </Field>
    </View>
  );
}

/** The ticks — one shelf's features, each a door this plan opens. */
export function FeaturePicker({ chosen, onToggle, audience }: { chosen: string[]; onToggle: (key: string) => void; audience: string }) {
  const shelf = PLAN_FEATURES.filter((f) => f.audience === audience);
  return (
    <View style={styles.gap}>
      <Text step="small" weight="medium" tone="title">
        What this plan includes
      </Text>
      {shelf.length === 0 ? (
        <Text step="caption" tone="muted">
          Nothing on this shelf yet — each tool arrives with its own lock.
        </Text>
      ) : null}
      {shelf.map((f) => (
        <Toggle key={f.key} label={f.label} hint={f.blurb} value={chosen.includes(f.key)} onChange={() => onToggle(f.key)} />
      ))}
    </View>
  );
}

/** The limits and the ribbon, shared by the new and the existing plan. */
function Terms({ form, set }: { form: PlanForm; set: <K extends keyof PlanForm>(k: K, v: PlanForm[K]) => void }) {
  return (
    <>
      <View style={styles.pair}>
        <NumBox label="Free trial (days)" value={form.trialDays} onChange={(n) => set("trialDays", n)} />
        <NumBox label="Staff accounts" value={form.maxStaff} onChange={(n) => set("maxStaff", Math.max(1, n))} />
      </View>
      {/* an agency owns no resorts and has no rooms, so both caps mean nothing there */}
      {form.audience !== "AGENCY" ? (
        <View style={styles.pair}>
          <NumBox label="Rooms per resort" value={form.maxRooms} onChange={(n) => set("maxRooms", Math.max(1, n))} />
          <NumBox label="Resorts per owner" value={form.maxResorts} onChange={(n) => set("maxResorts", Math.max(1, n))} />
        </View>
      ) : null}
      <View style={styles.pair}>
        <NumBox label="Shown in position" value={form.sortOrder} onChange={(n) => set("sortOrder", n)} />
        <View style={styles.flex} />
      </View>
      <Toggle label="Recommend this one" hint="Wears the “Most popular” ribbon" value={form.highlight} onChange={(v) => set("highlight", v)} />
      <FeaturePicker
        chosen={form.features}
        audience={form.audience}
        onToggle={(key) => set("features", form.features.includes(key) ? form.features.filter((k) => k !== key) : [...form.features, key])}
      />
    </>
  );
}

export function PlanEditor({
  plan,
  busy,
  onSave,
  onDelete,
  money,
}: {
  plan: PlanDefinition;
  busy: boolean;
  onSave: (patch: PlanEdit) => void;
  onDelete: () => void;
  money: (n: number) => string;
}) {
  const [form, setForm] = useState<PlanForm>(() => toEdit(plan));
  useEffect(() => setForm(toEdit(plan)), [plan]);
  const set = <K extends keyof PlanForm>(k: K, v: PlanForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = JSON.stringify(form) !== JSON.stringify(toEdit(plan));

  return (
    <View style={styles.gap}>
      <Toggle label="On sale" hint={form.active ? "Shown on the pricing page" : "Retired — its customers stay"} value={form.active} onChange={(v) => set("active", v)} />
      <Field label="Name on the pricing page">
        <Input value={form.label} onChangeText={(t) => set("label", t)} maxLength={40} />
      </Field>
      <Field label="One line under it">
        <Input value={form.blurb} onChangeText={(t) => set("blurb", t)} maxLength={200} placeholder="For small resorts leaving spreadsheets" />
      </Field>
      <View style={styles.ladderBox}>
        <Text step="caption" weight="bold" tone="muted">
          PRICES
        </Text>
        <PlanLadder plan={plan.name} label={plan.label} money={money} />
      </View>
      <Terms form={form} set={set} />
      <Button label={busy ? "Saving…" : dirty ? "Save changes" : "Saved"} disabled={!dirty || busy} onPress={() => onSave(form)} />
      <Button label="Delete" kind="danger" disabled={busy} onPress={onDelete} />
    </View>
  );
}

/** Every field the create form holds. */
const BLANK_PLAN: Required<NewPlan> = {
  name: "",
  label: "",
  price: 0,
  maxRooms: 10,
  maxResorts: 1,
  maxStaff: 1,
  trialDays: 14,
  features: [],
  blurb: "",
  active: true,
  sortOrder: 0,
  highlight: false,
  audience: "RESORT",
};

export function NewPlanForm({ busy, taken, onCreate, onCancel }: { busy: boolean; taken: string[]; onCreate: (body: NewPlan) => void; onCancel: () => void }) {
  const [form, setForm] = useState(BLANK_PLAN);
  const set = <K extends keyof PlanForm>(k: K, v: PlanForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const name = form.name.toUpperCase().replace(/[^A-Z0-9_]/g, "");
  const nameProblem = !/^[A-Z][A-Z0-9_]{1,15}$/.test(name)
    ? "2–16 characters, A–Z, 0–9 or _, starting with a letter"
    : taken.includes(name)
      ? "A plan already has that name"
      : null;
  // a feature belongs to one shelf, so a change of shelf clears the ticks; and
  // the room and resort caps are a resort's, so an agency plan carries zero
  const shelf = (audience: "RESORT" | "AGENCY") =>
    setForm((f) => ({
      ...f,
      audience,
      features: [],
      ...(audience === "AGENCY" ? { maxRooms: 0, maxResorts: 0 } : { maxRooms: Math.max(1, f.maxRooms), maxResorts: Math.max(1, f.maxResorts) }),
    }));

  return (
    <View style={styles.gap}>
      <Text step="small" tone="muted">
        A resort never sees an agency plan, and an agency never sees a resort plan.
      </Text>
      <View style={styles.chips}>
        <Chip label="Resorts" on={form.audience === "RESORT"} onPress={() => shelf("RESORT")} />
        <Chip label="Travel agencies" on={form.audience === "AGENCY"} onPress={() => shelf("AGENCY")} />
      </View>
      <Field label="Name" hint="Fixed once saved, because subscriptions point at it" error={name && nameProblem ? nameProblem : undefined}>
        <Input value={name} onChangeText={(t) => setForm({ ...form, name: t })} autoCapitalize="characters" placeholder="SEASON" />
      </Field>
      <Field label="Name on the pricing page">
        <Input value={form.label} onChangeText={(t) => setForm({ ...form, label: t })} maxLength={40} placeholder="Season" />
      </Field>
      <Field label="One line under it">
        <Input value={form.blurb} onChangeText={(t) => setForm({ ...form, blurb: t })} maxLength={200} />
      </Field>
      <Field label="Price a month" hint="Sold monthly to begin with. Save the plan, then add ways of buying it — a free first week, six months at half price, a three-year deal.">
        <Input value={String(form.price)} onChangeText={(t) => setForm({ ...form, price: whole(t) })} keyboardType="numeric" />
      </Field>
      <Terms form={form} set={set} />
      <Button label={busy ? "Creating…" : "Create plan"} disabled={busy || !!nameProblem || !form.label.trim()} onPress={() => onCreate({ ...form, name })} />
      <Button label="Cancel" kind="ghost" onPress={onCancel} />
    </View>
  );
}

/**
 * Shelves and rungs — "free for 2 weeks, then 1,250 a month for 3 months, then
 * 2,500 a month" is three rungs on one shelf. The last rung runs forever.
 */
export function PlanLadder({ plan, label, money }: { plan: string; label: string; money: (n: number) => string }) {
  const q = useApi<PlanScheduleInput[]>(keys.platform("schedules", plan), () => client.platform.planSchedules(plan));
  const [shelves, setShelves] = useState<Shelf[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (q.data) setShelves(toShelves(q.data));
  }, [q.data]);

  if (q.error && !shelves) return <Text step="small" tone="danger">{refusal(q.error)}</Text>;
  if (!shelves) return <Text step="small" tone="muted">Loading prices…</Text>;

  const edit = (i: number, patch: Partial<Shelf>) => setShelves(shelves.map((s, n) => (n === i ? { ...s, ...patch } : s)));
  const editRung = (i: number, j: number, patch: Partial<Rung>) => edit(i, { phases: shelves[i]!.phases.map((p, n) => (n === j ? { ...p, ...patch } : p)) });
  const problems = shelves.map((s) => (!s.label.trim() ? "Every way of buying needs a name" : phasesAreSane(asPhases(s.phases))));
  const seen = shelves.map((s) => s.label.trim().toLowerCase());
  const dupe = seen.some((l, i) => l && seen.indexOf(l) !== i);
  const blocked = shelves.length === 0 || dupe || problems.some(Boolean);

  const save = async () => {
    setBusy(true);
    setSaid(null);
    try {
      setShelves(toShelves(await client.platform.setPlanSchedules(plan, shelves)));
      setSaid({ ok: true, text: `Prices saved for ${label}` });
    } catch (e) {
      setSaid({ ok: false, text: refusal(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.gap}>
      {shelves.map((shelf, i) => (
        <View key={i} style={styles.shelf}>
          <Field label="Way of buying">
            <Input value={shelf.label} onChangeText={(t) => edit(i, { label: t })} placeholder="Monthly" />
          </Field>
          <Toggle label="On sale" value={shelf.active} onChange={(v) => edit(i, { active: v })} />
          {shelf.phases.map((rung, j) => {
            const last = j === shelf.phases.length - 1;
            return (
              <View key={j} style={styles.rung}>
                <View style={styles.rungHead}>
                  <Text step="caption" weight="bold" tone="muted" style={styles.flex}>
                    {`STEP ${j + 1}${last && shelf.phases.length > 1 ? " · SETTLES HERE" : ""}`}
                  </Text>
                  {shelf.phases.length > 1 ? (
                    <Button
                      label="Remove"
                      kind="subtle"
                      block={false}
                      onPress={() =>
                        edit(i, {
                          // whatever ends up last runs forever
                          phases: shelf.phases.filter((_, n) => n !== j).map((ph, n, all) => (n === all.length - 1 ? { ...ph, repeats: null } : ph)),
                        })
                      }
                    />
                  ) : null}
                </View>
                <View style={styles.chips}>
                  {PERIOD_UNITS.map((u) => (
                    <Chip key={u} label={`${u.toLowerCase()}${rung.count === 1 ? "" : "s"}`} on={rung.unit === u} onPress={() => editRung(i, j, { unit: u })} />
                  ))}
                </View>
                <View style={styles.pair}>
                  <NumBox label="Every" value={rung.count} onChange={(n) => editRung(i, j, { count: n })} />
                  <NumBox label="Price" value={rung.price} onChange={(n) => editRung(i, j, { price: n })} />
                  {last ? (
                    <View style={styles.flex}>
                      <Field label="Lasts">
                        <View style={styles.forever}>
                          <Text step="body" tone="muted">
                            forever
                          </Text>
                        </View>
                      </Field>
                    </View>
                  ) : (
                    <NumBox label="How many" value={rung.repeats ?? 1} onChange={(n) => editRung(i, j, { repeats: Math.max(1, n) })} />
                  )}
                </View>
              </View>
            );
          })}
          <Button
            label="Add a step"
            kind="ghost"
            onPress={() =>
              edit(i, {
                phases: [
                  // the rung that was last gets a length, because it is not last any more
                  ...shelf.phases.map((p, n, all) => (n === all.length - 1 ? { ...p, repeats: p.repeats ?? 1 } : p)),
                  { count: shelf.phases.at(-1)?.count ?? 1, unit: shelf.phases.at(-1)?.unit ?? "MONTH", price: shelf.phases.at(-1)?.price ?? 0, repeats: null },
                ],
              })
            }
          />
          <View style={styles.sentence}>
            {problems[i] ? (
              <Text step="small" tone="danger">
                {problems[i]}
              </Text>
            ) : (
              <Text step="small" tone="body">{`Customers see: ${scheduleSentence(asPhases(shelf.phases), money)}`}</Text>
            )}
          </View>
          <Button label="Remove this way of buying" kind="subtle" onPress={() => setShelves(shelves.filter((_, n) => n !== i))} />
        </View>
      ))}
      <Button label="Another way to buy" kind="ghost" onPress={() => setShelves([...shelves, { label: "", active: true, phases: [{ count: 1, unit: "MONTH", price: 0, repeats: null }] }])} />
      {dupe ? <Text step="small" tone="danger">Two ways of buying cannot share a name.</Text> : null}
      {shelves.length === 0 ? <Text step="small" tone="danger">A plan needs at least one way to buy it, or nobody can be put on it.</Text> : null}
      {said ? <Text step="small" tone={said.ok ? "ok" : "danger"}>{said.text}</Text> : null}
      <Button label="Save prices" loading={busy} disabled={blocked} onPress={() => void save()} />
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.md },
  pair: { flexDirection: "row", gap: space.sm },
  flex: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  ladderBox: { gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: color.ink[50] },
  shelf: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: color.surface, borderWidth: 1, borderColor: color.ink[100] },
  rung: { gap: space.sm, padding: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: color.ink[100] },
  rungHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  forever: { paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: color.ink[100] },
  sentence: { padding: space.sm, borderRadius: radius.md, backgroundColor: color.ink[50] },
});
