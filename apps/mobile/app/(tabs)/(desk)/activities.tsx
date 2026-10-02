/**
 * Activities — kayaking, a bonfire, a tea-garden walk — set up and sold from
 * the phone.
 *
 * This screen used to sell them only: "adding an activity, setting its week
 * and generating its slots stay on the desk". The owner, 2026-10-02:
 * whatever the console has, the app has. So here, as on the console: add and
 * edit an activity and its weekly pattern, turn it on and off, turn the
 * pattern into real slots for a stretch of days, take a slot out — and see
 * how full each slot is, as a bar rather than as "3 of 12".
 *
 * Changes are for managers, as on the console (`isManagement`); everybody
 * else sees the same activities and how full they are.
 */
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { keys, useApi, useQueryClient } from "@rh/app-core";
import {
  addDaysIso,
  dayLabel,
  formatMoney,
  percentOf,
  todayIn,
  type Activity,
  type ActivitySchedule,
  type ActivitySlot,
  type ResortOption,
} from "@rh/shared";
import { client, useAuth } from "../../../src/api/session";
import { WhichResort } from "../../../src/screens/which-resort";
import { ask, refusal } from "../../../src/screens/payroll-month";
import { Button } from "../../../src/design/button";
import { Chip } from "../../../src/design/chip";
import { Field, Input } from "../../../src/design/input";
import { useMoneyFormat } from "../../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../../src/design/states";
import { Card } from "../../../src/design/surface";
import { Text } from "../../../src/design/text";
import { useAction } from "../../../src/design/use-action";
import { color, elevation, radius, space } from "../../../src/design/tokens";

/** As `Date.getUTCDay()` counts them, which is how the API stores them. */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

type Icon = keyof typeof MaterialCommunityIcons.glyphMap;

/** A picture for a category, by what its code says it is; a star when nothing fits. */
function iconFor(category: string): Icon {
  const c = category.toLowerCase();
  if (/well|spa|massage|yoga/.test(c)) return "spa";
  if (/water|boat|kayak|swim|cruise|lake/.test(c)) return "kayaking";
  if (/tour|walk|trek|hike|nature/.test(c)) return "hiking";
  if (/food|dine|bbq|cook|meal/.test(c)) return "silverware-fork-knife";
  if (/advent|sport|zip|climb|cycle|bike/.test(c)) return "bike";
  if (/fire|night|camp|music|culture/.test(c)) return "campfire";
  if (/kid|child|game|play/.test(c)) return "gamepad-variant";
  return "star-four-points";
}

type Draft = {
  id?: number;
  name: string;
  category: string;
  basePrice: string;
  durationMin: string;
  minPerSlot: string;
  maxPerSlot: string;
  description: string;
  schedules: ActivitySchedule[];
};

const blank = (category: string): Draft => ({
  name: "",
  category,
  basePrice: "0",
  durationMin: "60",
  minPerSlot: "1",
  maxPerSlot: "10",
  description: "",
  schedules: [],
});

export default function ActivitiesScreen() {
  const { activeResort, isManagement } = useAuth();
  const resortId = activeResort?.id;
  const qc = useQueryClient();
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });
  const today = todayIn(activeResort?.timezone);

  const [open, setOpen] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [genFrom, setGenFrom] = useState(today);
  const [genTo, setGenTo] = useState(addDaysIso(today, 14));
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  const list = useApi<Activity[]>(keys.activities(resortId), () => client.activities.list(resortId!), {
    enabled: resortId !== undefined,
  });
  const categories = useApi<ResortOption[]>(
    keys.options(resortId, "ACTIVITY_CATEGORY"),
    () => client.options.list(resortId!, "ACTIVITY_CATEGORY"),
    { enabled: resortId !== undefined, staleTime: 3_600_000 },
  );
  const slots = useApi<ActivitySlot[]>(
    ["activity-slots", resortId, open],
    () => client.activities.slots(resortId!, open!, { from: today, to: addDaysIso(today, 14), futureOnly: true }),
    { enabled: resortId !== undefined && open !== null },
  );

  const reload = async () => {
    await qc.invalidateQueries({ queryKey: keys.activities(resortId) });
    await qc.invalidateQueries({ queryKey: ["activity-slots", resortId] });
  };

  async function act(fn: () => Promise<unknown>, ok: string) {
    setSaid(null);
    try {
      await fn();
      setSaid({ ok: true, text: ok });
      await reload();
      return true;
    } catch (e) {
      setSaid({ ok: false, text: refusal(e) });
      return false;
    }
  }

  const save = useAction(async () => {
    if (!draft || resortId === undefined) return;
    if (!draft.name.trim() || !draft.category) {
      setSaid({ ok: false, text: "An activity needs a name and a category." });
      return;
    }
    const body = {
      name: draft.name.trim(),
      category: draft.category,
      basePrice: Number(draft.basePrice) || 0,
      durationMin: Number(draft.durationMin) || 60,
      minPerSlot: Number(draft.minPerSlot) || 1,
      maxPerSlot: Number(draft.maxPerSlot) || 10,
      description: draft.description.trim() || undefined,
    };
    const rows = draft.schedules.map(({ weekday, startTime, endTime, capacity, active }) => ({
      weekday,
      startTime,
      endTime,
      capacity,
      active: active ?? true,
    }));
    const ok = await act(async () => {
      if (draft.id) {
        await client.activities.update(draft.id, body);
        await client.activities.setSchedules(draft.id, rows);
      } else {
        const made = await client.activities.create(resortId, body);
        if (rows.length) await client.activities.setSchedules(made.id, rows);
      }
    }, "Activity saved");
    if (ok) setDraft(null);
  });

  const header = <Stack.Screen options={{ title: "Activities" }} />;
  if (resortId === undefined) return (<>{header}<WhichResort what="the activities" /></>);
  if (list.error && !list.data) return (<>{header}<Problem error={list.error} onRetry={() => void list.refetch()} /></>);
  if (!list.data) return (<>{header}<Loading what="the activities" /></>);

  const cats = (categories.data ?? []).filter((c) => c.active);
  const catLabel = (code: string) => cats.find((c) => c.code === code)?.label ?? code.replace(/_/g, " ").toLowerCase();
  const rows = list.data;

  const editor = draft ? (
    <Card title={draft.id ? `Edit — ${draft.name}` : "A new activity"}>
      <View style={styles.fields}>
        <Field label="Name">
          <Input value={draft.name} onChangeText={(t) => setDraft({ ...draft, name: t })} placeholder="Kayaking on the lake" />
        </Field>
        <Text step="small" weight="medium" tone="title">
          Category
        </Text>
        <View style={styles.chips}>
          {cats.map((c) => (
            <Chip key={c.code} label={c.label} on={draft.category === c.code} onPress={() => setDraft({ ...draft, category: c.code })} />
          ))}
        </View>
        <View style={styles.pair}>
          <View style={styles.flex}>
            <Field label="Price a person">
              <Input value={draft.basePrice} onChangeText={(t) => setDraft({ ...draft, basePrice: t })} keyboardType="numeric" />
            </Field>
          </View>
          <View style={styles.flex}>
            <Field label="Minutes">
              <Input value={draft.durationMin} onChangeText={(t) => setDraft({ ...draft, durationMin: t })} keyboardType="numeric" />
            </Field>
          </View>
        </View>
        <View style={styles.pair}>
          <View style={styles.flex}>
            <Field label="At least">
              <Input value={draft.minPerSlot} onChangeText={(t) => setDraft({ ...draft, minPerSlot: t })} keyboardType="numeric" />
            </Field>
          </View>
          <View style={styles.flex}>
            <Field label="At most">
              <Input value={draft.maxPerSlot} onChangeText={(t) => setDraft({ ...draft, maxPerSlot: t })} keyboardType="numeric" />
            </Field>
          </View>
        </View>
        <Field label="What it is" hint="Optional">
          <Input value={draft.description} onChangeText={(t) => setDraft({ ...draft, description: t })} multiline />
        </Field>

        <Text step="small" weight="medium" tone="title">
          Every week
        </Text>
        {draft.schedules.length === 0 ? (
          <Text step="caption" tone="muted">
            No times yet — add one, or make slots by hand later.
          </Text>
        ) : null}
        {draft.schedules.map((s, i) => {
          const set = (patch: Partial<ActivitySchedule>) => {
            const next = [...draft.schedules];
            next[i] = { ...s, ...patch };
            setDraft({ ...draft, schedules: next });
          };
          return (
            <View key={i} style={styles.schedule}>
              <View style={styles.chips}>
                {WEEKDAYS.map((d, di) => (
                  <Chip key={d} label={d} on={s.weekday === di} onPress={() => set({ weekday: di })} />
                ))}
              </View>
              <View style={styles.pair}>
                <View style={styles.flex}>
                  <Field label="Starts">
                    <Input value={s.startTime} onChangeText={(t) => set({ startTime: t })} placeholder="10:00" />
                  </Field>
                </View>
                <View style={styles.flex}>
                  <Field label="Ends">
                    <Input value={s.endTime} onChangeText={(t) => set({ endTime: t })} placeholder="11:00" />
                  </Field>
                </View>
                <View style={styles.flex}>
                  <Field label="Seats">
                    <Input value={String(s.capacity)} onChangeText={(t) => set({ capacity: Number(t.replace(/\D/g, "")) || 1 })} keyboardType="numeric" />
                  </Field>
                </View>
              </View>
              <Button label="Take this time off" kind="subtle" onPress={() => setDraft({ ...draft, schedules: draft.schedules.filter((_, j) => j !== i) })} />
            </View>
          );
        })}
        <Button
          label="Add a time"
          kind="ghost"
          onPress={() =>
            setDraft({
              ...draft,
              schedules: [...draft.schedules, { weekday: 5, startTime: "10:00", endTime: "11:00", capacity: Number(draft.maxPerSlot) || 10, active: true }],
            })
          }
        />
        <Button label="Save the activity" loading={save.busy} onPress={save.go} />
        <Button label="Cancel" kind="ghost" onPress={() => setDraft(null)} />
      </View>
    </Card>
  ) : null;

  return (
    <>
      {header}
      <Stale age={list.stale} />
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
      >
        {isManagement && !draft ? <Button label="New activity" onPress={() => setDraft(blank(cats[0]?.code ?? ""))} /> : null}
        {said ? (
          <Text step="small" weight="medium" tone={said.ok ? "ok" : "danger"}>
            {said.text}
          </Text>
        ) : null}
        {draft && !draft.id ? editor : null}

        {rows.length === 0 && !draft ? (
          <Card>
            <Empty message="Nothing on offer yet" hint={isManagement ? "Add the first activity above." : "A manager adds them."} />
          </Card>
        ) : null}

        {rows.map((a, ai) => {
          const tint = color.chart.series[ai % color.chart.series.length]!;
          const runs = new Set(a.schedules.filter((s) => s.active !== false).map((s) => s.weekday));
          const idle = a.active && a.upcomingSlots === 0;
          const isOpen = open === a.id;
          if (draft?.id === a.id) return <View key={a.id}>{editor}</View>;
          return (
            <View key={a.id} style={[styles.activity, a.active ? null : styles.dim]}>
              <View
                style={[styles.band, { backgroundColor: tint }]}
                accessible
                accessibilityLabel={`${a.name}, ${whole(a.basePrice)} for ${a.durationMin} minutes, takes ${a.minPerSlot} to ${a.maxPerSlot} people`}
              >
                <MaterialCommunityIcons name={iconFor(a.category)} size={28} color={color.onBrand} />
                <View style={styles.flex}>
                  <Text step="strong" weight="bold" tone="onBrand" numberOfLines={1}>
                    {a.name}
                  </Text>
                  <Text step="caption" tone="onBrand" numberOfLines={1}>
                    {`${catLabel(a.category)} · ${a.durationMin} min · ${a.minPerSlot}–${a.maxPerSlot} people`}
                  </Text>
                </View>
                <Text step="title" weight="bold" tone="onBrand" tabular>
                  {whole(a.basePrice)}
                </Text>
              </View>
              <View style={styles.body}>
                <View style={styles.week} accessible accessibilityLabel={`Runs ${[...runs].map((d) => WEEKDAYS[d]).join(", ") || "on no weekly pattern"}`}>
                  {WEEKDAYS.map((d, di) => (
                    <View key={d} style={[styles.day, runs.has(di) ? { backgroundColor: tint } : null]}>
                      <Text step="caption" weight="bold" tone={runs.has(di) ? "onBrand" : "muted"}>
                        {d.slice(0, 1)}
                      </Text>
                    </View>
                  ))}
                </View>
                {!a.active ? (
                  <Text step="caption" weight="medium" tone="muted">
                    Not on offer
                  </Text>
                ) : null}
                {idle ? (
                  <View style={styles.idle}>
                    <Text step="caption" weight="medium" tone="warn">
                      On offer with no slots made — nobody can book it
                    </Text>
                  </View>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Next ${a.nextSlot ? dayLabel(a.nextSlot) : "none"}, ${a.upcomingSlots} slots ahead`}
                  onPress={() => setOpen(isOpen ? null : a.id)}
                  style={styles.next}
                >
                  <Text step="small" tone="body" style={styles.flex}>
                    {a.nextSlot ? `Next ${dayLabel(a.nextSlot, { style: "full" })}` : "Nothing coming up"}
                  </Text>
                  <Text step="small" weight="bold" tone="ok">
                    {`${a.upcomingSlots} slot${a.upcomingSlots === 1 ? "" : "s"} ${isOpen ? "▴" : "▾"}`}
                  </Text>
                </Pressable>

                {isOpen ? (
                  !slots.data ? (
                    <Loading what="the slots" />
                  ) : slots.data.length === 0 ? (
                    <Empty message="No slots in the next fortnight" />
                  ) : (
                    slots.data.map((s) => {
                      const full = percentOf(s.bookedCount, s.capacity);
                      return (
                        <View key={s.id} style={styles.slot} accessible accessibilityLabel={`${dayLabel(s.startsAt, { style: "full" })}, ${s.remaining} of ${s.capacity} left`}>
                          <View style={styles.slotHead}>
                            <Text step="small" weight="medium" tone="title" style={styles.flex}>
                              {dayLabel(s.startsAt, { style: "full" })}
                            </Text>
                            <Text step="small" weight="bold" tone={s.remaining === 0 ? "danger" : s.remaining <= 2 ? "warn" : "ok"} tabular>
                              {s.remaining === 0 ? "Full" : `${s.remaining} left`}
                            </Text>
                            {isManagement ? (
                              <Button
                                label="×"
                                kind="subtle"
                                block={false}
                                accessibilityLabel={`Take out the slot of ${dayLabel(s.startsAt, { style: "full" })}`}
                                onPress={() => ask("Take this slot out?", s.bookedCount > 0 ? "It has bookings on it." : "Nobody is booked on it.", "Take out", () => void act(() => client.activities.removeSlot(s.id), "Slot taken out"))}
                              />
                            ) : null}
                          </View>
                          <View style={styles.track}>
                            <View style={{ width: `${full}%`, backgroundColor: full >= 100 ? color.chart.money.late.solid : full >= 75 ? color.chart.money.left.solid : color.chart.money.paid.solid }} />
                          </View>
                          <Text step="caption" tone="muted" tabular>{`${s.bookedCount} of ${s.capacity} taken`}</Text>
                        </View>
                      );
                    })
                  )
                ) : null}

                {isManagement ? (
                  <View style={styles.acts}>
                    <Button
                      label="Edit"
                      kind="ghost"
                      block={false}
                      onPress={() =>
                        setDraft({
                          id: a.id,
                          name: a.name,
                          category: a.category,
                          basePrice: String(a.basePrice),
                          durationMin: String(a.durationMin),
                          minPerSlot: String(a.minPerSlot),
                          maxPerSlot: String(a.maxPerSlot),
                          description: a.description ?? "",
                          schedules: a.schedules.map((s) => ({ ...s })),
                        })
                      }
                    />
                    <Button
                      label={a.active ? "Take off offer" : "Put on offer"}
                      kind="ghost"
                      block={false}
                      onPress={() => void act(() => client.activities.update(a.id, { active: !a.active }), a.active ? `${a.name} is off offer` : `${a.name} is on offer`)}
                    />
                  </View>
                ) : null}
                {isManagement && isOpen ? (
                  <View style={styles.generate}>
                    <Text step="small" weight="medium" tone="title">
                      Make slots from the weekly pattern
                    </Text>
                    <View style={styles.pair}>
                      <View style={styles.flex}>
                        <Field label="From">
                          <Input value={genFrom} onChangeText={setGenFrom} placeholder={today} />
                        </Field>
                      </View>
                      <View style={styles.flex}>
                        <Field label="To">
                          <Input value={genTo} onChangeText={setGenTo} placeholder={addDaysIso(today, 14)} />
                        </Field>
                      </View>
                    </View>
                    <Button
                      label="Make the slots"
                      disabled={!DAY.test(genFrom) || !DAY.test(genTo)}
                      onPress={async () => {
                        setSaid(null);
                        try {
                          const r = await client.activities.generate(a.id, genFrom, genTo);
                          setSaid({ ok: true, text: `Made ${r.created} slots (${r.matched} matched the week, ${r.totalSlots} in all)` });
                          await reload();
                        } catch (e) {
                          setSaid({ ok: false, text: refusal(e) });
                        }
                      }}
                    />
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  fields: { gap: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  pair: { flexDirection: "row", gap: space.sm },
  flex: { flex: 1 },
  dim: { opacity: 0.65 },
  activity: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: color.ink[100],
    ...elevation.raised,
  },
  band: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg },
  body: { padding: space.lg, gap: space.md },
  week: { flexDirection: "row", gap: space.xs },
  day: { flex: 1, height: 30, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: color.ink[100] },
  idle: { backgroundColor: color.warn.bg, borderWidth: 1, borderColor: color.warn.line, borderRadius: radius.md, padding: space.sm },
  next: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44 },
  slot: { gap: 4, paddingVertical: space.xs },
  slotHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  track: { height: 8, flexDirection: "row", borderRadius: radius.pill, overflow: "hidden", backgroundColor: color.ink[100] },
  acts: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  generate: { gap: space.sm, borderTopWidth: 1, borderTopColor: color.line, paddingTop: space.md },
  schedule: { gap: space.sm, borderWidth: 1, borderColor: color.line, borderRadius: radius.md, padding: space.md },
});
