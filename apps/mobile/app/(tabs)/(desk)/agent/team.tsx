/**
 * Who works at the agency, what each of them may do, and what they did — run
 * from the phone, as from the console's three tabs.
 *
 * This screen was read-only until 2026-10-02, on the grounds that a role is
 * thirty checkboxes and a password hands over an account. The owner: whatever
 * the console has, the app has. The checkboxes are chips, a group at a time;
 * setting a password asks first, and nobody can set their own here.
 */
import { useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { useApi, useQueryClient } from "@rh/app-core";
import {
  AGENT_PERMISSIONS,
  PERMISSIONS,
  emailError,
  phoneError,
  type AgencyActivity,
  type AgencyRole,
  type AgencyStaff,
} from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { ask, refusal } from "../../../../src/screens/payroll-month";
import { Button } from "../../../../src/design/button";
import { Chip } from "../../../../src/design/chip";
import { Field, Input } from "../../../../src/design/input";
import { Lenses } from "../../../../src/design/lenses";
import { Empty, Loading, Problem } from "../../../../src/design/states";
import { Card } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { color, elevation, radius, space } from "../../../../src/design/tokens";

const TABS = ["People", "Roles", "Activity"] as const;
const labelFor = (key: string) => PERMISSIONS.find((p) => p.key === key)?.label ?? key;

export default function AgentTeamScreen() {
  const { me, can } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]>("People");
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  const people = useApi<AgencyStaff[]>(["agent-staff"], () => client.agent.staff(), { enabled: Boolean(me) });
  const roles = useApi<AgencyRole[]>(["agent-roles"], () => client.agent.roles(), { enabled: Boolean(me) });

  const reload = async () => {
    await qc.invalidateQueries({ queryKey: ["agent-staff"] });
    await qc.invalidateQueries({ queryKey: ["agent-roles"] });
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

  const header = <Stack.Screen options={{ title: "My team" }} />;
  if (people.error && !people.data) return (<>{header}<Problem error={people.error} onRetry={() => void people.refetch()} /></>);
  if (!people.data) return (<>{header}<Loading what="the team" /></>);

  return (
    <>
      {header}
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={people.isRefetching} onRefresh={() => void reload()} />}
      >
        <Lenses options={TABS} value={tab} onChange={setTab} />
        {said ? (
          <Text step="small" weight="medium" tone={said.ok ? "ok" : "danger"}>
            {said.text}
          </Text>
        ) : null}
        {tab === "People" ? (
          <People rows={people.data} roles={roles.data ?? []} meId={me?.id} mayPassword={can("agent.staff.password")} act={act} />
        ) : tab === "Roles" ? (
          <Roles roles={roles.data ?? []} act={act} />
        ) : (
          <Activity />
        )}
      </ScrollView>
    </>
  );
}

type Act = (fn: () => Promise<unknown>, ok: string) => Promise<boolean>;

function People({ rows, roles, meId, mayPassword, act }: { rows: AgencyStaff[]; roles: AgencyRole[]; meId?: number; mayPassword: boolean; act: Act }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [pw, setPw] = useState<{ id: number; value: string } | null>(null);
  const ready = form.name.trim() && !emailError(form.email) && !phoneError(form.phone) && form.password.length >= 8;
  return (
    <View style={styles.gap}>
      {rows.length === 0 ? (
        <Card>
          <Empty message="Nobody else works here yet" />
        </Card>
      ) : (
        rows.map((p, i) => {
          const off = p.status !== "active";
          return (
            <View key={p.id} style={styles.person} accessible={false}>
              <View style={styles.personHead}>
                <View style={[styles.avatar, { backgroundColor: color.chart.series[i % color.chart.series.length] }]}>
                  <Text step="body" weight="bold" tone="onBrand">
                    {p.name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Text step="body" weight="bold" tone="title" numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text step="caption" tone="muted" numberOfLines={1}>
                    {[p.phone, p.email].filter(Boolean).join(" · ") || "No contact"}
                  </Text>
                </View>
                {off ? (
                  <View style={styles.offPill}>
                    <Text step="caption" weight="bold" tone="warn">
                      {p.status}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text step="caption" weight="medium" tone="muted">
                Role
              </Text>
              <View style={styles.chips}>
                <Chip label="Default (book & wallet)" on={p.agentRoleId == null} onPress={() => void act(() => client.agent.setStaffRole(p.id, null), `${p.name} is on the default set`)} />
                {roles.map((r) => (
                  <Chip key={r.id} label={r.name} on={p.agentRoleId === r.id} onPress={() => void act(() => client.agent.setStaffRole(p.id, r.id), `${p.name} is now ${r.name}`)} />
                ))}
              </View>
              {mayPassword && p.id !== meId ? (
                pw?.id === p.id ? (
                  <View style={styles.gap}>
                    <Field label={`A new password for ${p.name}`} hint="At least 8 characters">
                      <Input value={pw.value} onChangeText={(t) => setPw({ id: p.id, value: t })} secureTextEntry autoCapitalize="none" />
                    </Field>
                    <Button
                      label="Set it"
                      disabled={pw.value.length < 8}
                      onPress={() =>
                        ask(`Set ${p.name}'s password?`, "They sign in with the new one from now on.", "Set it", () =>
                          void act(() => client.agent.setStaffPassword(p.id, pw.value), `${p.name}'s password is set`).then((ok) => ok && setPw(null)),
                        )
                      }
                    />
                    <Button label="Not now" kind="ghost" onPress={() => setPw(null)} />
                  </View>
                ) : (
                  <Button label="Set a password" kind="ghost" onPress={() => setPw({ id: p.id, value: "" })} />
                )
              ) : null}
            </View>
          );
        })
      )}
      <Card title="Add someone">
        <View style={styles.gap}>
          <Field label="Name">
            <Input value={form.name} onChangeText={(t) => setForm({ ...form, name: t })} />
          </Field>
          <Field label="Email">
            <Input value={form.email} onChangeText={(t) => setForm({ ...form, email: t })} keyboardType="email-address" autoCapitalize="none" />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChangeText={(t) => setForm({ ...form, phone: t })} keyboardType="phone-pad" />
          </Field>
          <Field label="Temporary password" hint="At least 8 characters; they can change it in their profile">
            <Input value={form.password} onChangeText={(t) => setForm({ ...form, password: t })} secureTextEntry autoCapitalize="none" />
          </Field>
          <Button
            label="Add them"
            disabled={!ready}
            onPress={async () => {
              if (await act(() => client.agent.addStaff(form), `${form.name.trim()} can sign in now`)) setForm({ name: "", email: "", phone: "", password: "" });
            }}
          />
        </View>
      </Card>
    </View>
  );
}

function Roles({ roles, act }: { roles: AgencyRole[]; act: Act }) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>(["agent.book"]);
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  return (
    <View style={styles.gap}>
      {roles.length === 0 ? (
        <Card>
          <Empty message="No roles yet" hint="Everyone gets the default set until there is one." />
        </Card>
      ) : (
        roles.map((r, i) => (
          <View key={r.id} style={styles.person}>
            <View style={styles.personHead}>
              <View style={[styles.roleMark, { backgroundColor: color.chart.series[(i + 2) % color.chart.series.length] }]} />
              <Text step="body" weight="bold" tone="title" style={styles.flex}>
                {r.name}
              </Text>
              <Text step="small" tone="muted">{`${r.staff} ${r.staff === 1 ? "person" : "people"}`}</Text>
            </View>
            <View style={styles.chips}>
              {r.permissions.map((k) => (
                <View key={k} style={styles.perm}>
                  <Text step="caption" tone="body">
                    {labelFor(k)}
                  </Text>
                </View>
              ))}
            </View>
            <Button
              label="Delete the role"
              kind="subtle"
              onPress={() => ask(`Delete ${r.name}?`, "Anyone on it goes back to the default.", "Delete", () => void act(() => client.agent.deleteRole(r.id), `${r.name} deleted`))}
            />
          </View>
        ))
      )}
      <Card title="A new role">
        <View style={styles.gap}>
          <Text step="small" tone="muted">
            Tick exactly what this role may do. You keep everything yourself — only staff can be given less.
          </Text>
          <Field label="Name">
            <Input value={name} onChangeText={setName} placeholder="Junior booker" />
          </Field>
          <View style={styles.chips}>
            {AGENT_PERMISSIONS.map((k) => (
              <Chip key={k} label={labelFor(k)} on={picked.includes(k)} onPress={() => toggle(k)} />
            ))}
          </View>
          <Button
            label="Create the role"
            disabled={!name.trim() || picked.length === 0}
            onPress={async () => {
              if (await act(() => client.agent.createRole({ name: name.trim(), permissions: picked }), `Role "${name.trim()}" created`)) {
                setName("");
                setPicked(["agent.book"]);
              }
            }}
          />
        </View>
      </Card>
    </View>
  );
}

function Activity() {
  const [rows, setRows] = useState<AgencyActivity[] | null>(null);
  const [q, setQ] = useState("");
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      client.agent
        .activity({ q: q.trim() || undefined })
        .then((r) => {
          setRows(r);
          setDenied(false);
        })
        .catch(() => {
          setRows([]);
          setDenied(true);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <View style={styles.gap}>
      <Input value={q} onChangeText={setQ} placeholder="Search by person or action…" accessibilityLabel="Search the activity" />
      {!rows ? (
        <Loading what="the activity" />
      ) : denied ? (
        <Empty message="Only the agency itself can see this" />
      ) : rows.length === 0 ? (
        <Empty message={q ? "No matches" : "Nothing yet"} />
      ) : (
        rows.map((a) => (
          <View key={a.id} style={styles.activity}>
            <View style={styles.dot} />
            <View style={styles.flex}>
              <Text step="small" weight="medium" tone="title" numberOfLines={1}>
                {`${a.actor?.name ?? "Someone"} · ${a.action.replace(/\./g, " · ")}`}
              </Text>
              <Text step="caption" tone="muted" numberOfLines={1}>
                {`${new Date(a.at).toLocaleString("en-GB")}${a.resort ? ` · ${a.resort.name}` : ""}`}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  gap: { gap: space.md },
  flex: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  person: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
    borderWidth: 1,
    borderColor: color.ink[100],
    ...elevation.raised,
  },
  personHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  offPill: { backgroundColor: color.warn.bg, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
  roleMark: { width: 12, height: 12, borderRadius: 6 },
  perm: { backgroundColor: color.ink[100], borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 2 },
  activity: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.brand[500] },
});
