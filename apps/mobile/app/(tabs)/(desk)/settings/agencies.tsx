/**
 * Agent access: which travel agencies sell this resort, on what terms.
 *
 * The console's "Agent access" tab, on the phone. Every agency the platform
 * has verified can sell the resort; what is left to the resort is its own
 * commercial decisions — the standard commission, a different deal with one
 * agency, refusing one outright, and inviting one that is not on the
 * platform yet.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { keys, useApi, useQueryClient } from "@rh/app-core";
import { emailError, planFeatureLabel, type CommissionTermsRow, type ResortAgencyTerms } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { WhichResort } from "../../../../src/screens/which-resort";
import { Button } from "../../../../src/design/button";
import { Chip } from "../../../../src/design/chip";
import { Field, Input } from "../../../../src/design/input";
import { Empty, Loading, Problem } from "../../../../src/design/states";
import { Card } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { useAction } from "../../../../src/design/use-action";
import { color, radius, space } from "../../../../src/design/tokens";

export default function AgenciesScreen() {
  const { activeResort, can, features } = useAuth();
  const rid = activeResort?.id;
  const qc = useQueryClient();
  const open = features.includes("agents");
  const editable = can("agents.manage");

  const list = useApi<ResortAgencyTerms[]>(["agencies", rid], () => client.resort.agencies(rid!), { enabled: rid !== undefined });
  const terms = useApi<CommissionTermsRow>(["commission", rid], () => client.resort.commission(rid!), { enabled: rid !== undefined });

  const [kind, setKind] = useState<string | null>(null);
  const [rate, setRate] = useState<string | null>(null);
  const [deal, setDeal] = useState<Record<number, string>>({});
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  const shownKind = kind ?? terms.data?.kind ?? "PERCENT";
  const shownRate = rate ?? (terms.data ? String(terms.data.rate) : "");
  const reload = () => qc.invalidateQueries({ queryKey: ["agencies", rid] });

  async function run(fn: () => Promise<unknown>, ok: string) {
    setSaid(null);
    try {
      await fn();
      setSaid({ ok: true, text: ok });
      await reload();
    } catch (e) {
      setSaid({ ok: false, text: e instanceof Error ? e.message : "That did not go through." });
    }
  }

  const saveCommission = useAction(() =>
    run(async () => {
      await client.resort.setCommission(rid!, { kind: shownKind, rate: Number(shownRate) });
      await qc.invalidateQueries({ queryKey: ["commission", rid] });
    }, "Commission saved — it applies to every agent"),
  );
  const invite = useAction(() =>
    run(async () => {
      const r = await client.resort.inviteAgency(rid!, { email: email.trim(), name: name.trim() || undefined });
      setEmail("");
      setName("");
      setSaid({ ok: true, text: r.emailed ? "Invitation sent — the agency signs itself up from the link" : "Agency told — it is already on the platform" });
    }, "Invitation sent"),
  );

  const header = <Stack.Screen options={{ title: "Agent access" }} />;
  if (rid === undefined) return (<>{header}<WhichResort /></>);
  if (list.error && !list.data) return (<>{header}<Problem error={list.error} onRetry={() => void list.refetch()} /></>);
  if (!list.data) return (<>{header}<Loading what="the agencies" /></>);

  return (
    <>
      {header}
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
      >
        <Card title="Travel agencies">
          <Text step="small" tone="muted">
            {open
              ? "Every agency the platform has verified can find your resort and book for its clients, on your commission. Block any agency below — it takes effect on its next tap."
              : `Your plan does not include ${planFeatureLabel("agents")}, so no agency can sell your rooms.`}
          </Text>
        </Card>

        {said ? (
          <View style={[styles.note, said.ok ? styles.ok : styles.bad]}>
            <Text step="small" weight="medium" tone={said.ok ? "ok" : "danger"}>
              {said.text}
            </Text>
          </View>
        ) : null}

        <Card title="Standard commission">
          <View style={styles.fields}>
            <View style={styles.chips}>
              <Chip label="Percent of rent" on={shownKind === "PERCENT"} onPress={() => editable && setKind("PERCENT")} />
              <Chip label="Fixed per booking" on={shownKind === "FLAT"} onPress={() => editable && setKind("FLAT")} />
            </View>
            <Field label={shownKind === "FLAT" ? "Per booking" : "Percent"}>
              <Input value={shownRate} onChangeText={setRate} keyboardType="numeric" editable={editable} />
            </Field>
            {editable ? <Button label="Save commission" loading={saveCommission.busy} onPress={saveCommission.go} disabled={shownRate === ""} /> : null}
          </View>
        </Card>

        <Card title={`Verified agencies (${list.data.length})`}>
          {list.data.length === 0 ? (
            <Empty message="No agency has been verified on the platform yet" />
          ) : (
            list.data.map((a, i) => (
              <View key={a.accountId} style={[styles.agency, i < list.data!.length - 1 ? styles.ruled : null]}>
                <View style={styles.agencyHead}>
                  <View style={styles.flex}>
                    <Text step="body" weight="bold" tone="title" numberOfLines={1}>
                      {a.name}
                    </Text>
                    <Text step="caption" tone="muted" numberOfLines={1}>
                      {a.commissionRate != null
                        ? `Its own deal: ${a.commissionKind === "FLAT" ? `flat ${a.commissionRate}` : `${a.commissionRate}%`}`
                        : "On your standard commission"}
                    </Text>
                  </View>
                  <View style={[styles.badge, a.blocked ? styles.badgeBad : open ? styles.badgeOk : null]}>
                    <Text step="caption" weight="bold" tone={a.blocked ? "danger" : open ? "ok" : "muted"} numberOfLines={1}>
                      {a.blocked ? "Blocked" : open ? "Selling" : "Resort closed"}
                    </Text>
                  </View>
                </View>
                {editable ? (
                  <View style={styles.agencyActs}>
                    <View style={styles.flex}>
                      <Input
                        value={deal[a.accountId] ?? ""}
                        onChangeText={(t) => setDeal({ ...deal, [a.accountId]: t })}
                        keyboardType="numeric"
                        placeholder={a.commissionRate != null ? `${a.commissionRate}%` : "Its own %"}
                        accessibilityLabel={`Commission for ${a.name}`}
                      />
                    </View>
                    <Button
                      label="Save"
                      kind="ghost"
                      block={false}
                      accessibilityLabel={`Save the commission for ${a.name}`}
                      onPress={() => {
                        const v = (deal[a.accountId] ?? "").trim();
                        void run(
                          () => client.resort.setAgencyTerms(rid!, a.accountId, { commissionKind: "PERCENT", commissionRate: v === "" ? null : Number(v) }),
                          v === "" ? `${a.name} is back on your standard rate` : `${a.name} now earns ${v}% with you`,
                        );
                      }}
                    />
                    <Button
                      label={a.blocked ? "Unblock" : "Block"}
                      kind={a.blocked ? "ghost" : "danger"}
                      block={false}
                      accessibilityLabel={`${a.blocked ? "Unblock" : "Block"} ${a.name}`}
                      onPress={() =>
                        void run(
                          () => client.resort.setAgencyTerms(rid!, a.accountId, { blocked: !a.blocked }),
                          a.blocked ? `${a.name} can sell your rooms again` : `${a.name} is blocked from selling your rooms`,
                        )
                      }
                    />
                  </View>
                ) : null}
              </View>
            ))
          )}
        </Card>

        {editable ? (
          <Card title="Invite an agency by email">
            <View style={styles.fields}>
              <Field label="Agency email">
                <Input value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="agency@email.com" />
              </Field>
              <Field label="Agency name" hint="Optional">
                <Input value={name} onChangeText={setName} />
              </Field>
              <Text step="caption" tone="muted">
                The agency receives a link to sign up and sets its own sign-in. Once the platform verifies it, it can sell for you.
              </Text>
              <Button label="Send invitation" loading={invite.busy} onPress={invite.go} disabled={!!emailError(email)} />
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  fields: { gap: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  flex: { flex: 1 },
  agency: { paddingVertical: space.md, gap: space.sm },
  ruled: { borderBottomWidth: 1, borderBottomColor: color.line },
  agencyHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  agencyActs: { flexDirection: "row", alignItems: "center", gap: space.sm },
  badge: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: color.ink[100] },
  badgeOk: { backgroundColor: color.ok.bg },
  badgeBad: { backgroundColor: color.danger.bg },
  note: { borderRadius: radius.md, padding: space.md, borderWidth: 1 },
  ok: { backgroundColor: color.ok.bg, borderColor: color.ok.line },
  bad: { backgroundColor: color.danger.bg, borderColor: color.danger.line },
});
