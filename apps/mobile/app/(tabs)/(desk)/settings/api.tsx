/**
 * API keys and webhooks, on the phone — the console's "API" tab.
 *
 * A key lets the resort's own website read its rooms, rates and free nights
 * (and, if allowed, book). A webhook is an address the platform tells about
 * new bookings and payments. A new key's secret is shown once, selectable and
 * shareable, because there is no other moment to take it.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Share, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { WEBHOOK_EVENTS, type ApiKeyRow, type WebhookDeliveryRow, type WebhookEndpointRow } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { WhichResort } from "../../../../src/screens/which-resort";
import { ask, refusal } from "../../../../src/screens/payroll-month";
import { Button } from "../../../../src/design/button";
import { Chip } from "../../../../src/design/chip";
import { Field, Input } from "../../../../src/design/input";
import { Empty } from "../../../../src/design/states";
import { Card, Row } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { color, radius, space } from "../../../../src/design/tokens";

const STATE_TONE: Record<string, { bg: string; fg: string }> = {
  delivered: { bg: color.ok.bg, fg: color.ok.fg },
  trying: { bg: color.warn.bg, fg: color.warn.fg },
  "gave up": { bg: color.danger.bg, fg: color.danger.fg },
};

export default function ApiScreen() {
  const { activeResort } = useAuth();
  const rid = activeResort?.id;
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [endpoints, setEndpoints] = useState<WebhookEndpointRow[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryRow[]>([]);
  const [name, setName] = useState("");
  const [write, setWrite] = useState(false);
  const [url, setUrl] = useState("");
  const [minted, setMinted] = useState<{ what: string; secret: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (rid === undefined) return;
    await Promise.all([
      client.apiKeys.list(rid).then(setKeys).catch((e) => { setKeys([]); setSaid({ ok: false, text: refusal(e) }); }),
      client.webhooks.list(rid).then(setEndpoints).catch(() => setEndpoints([])),
      client.webhooks.deliveries(rid).then(setDeliveries).catch(() => setDeliveries([])),
    ]);
  }, [rid]);
  useEffect(() => void load(), [load]);

  async function run<T>(key: string, fn: () => Promise<T>, ok: string): Promise<T | null> {
    setBusy(key);
    setSaid(null);
    try {
      const r = await fn();
      setSaid({ ok: true, text: ok });
      await load();
      return r;
    } catch (e) {
      setSaid({ ok: false, text: refusal(e) });
      return null;
    } finally {
      setBusy(null);
    }
  }

  const header = <Stack.Screen options={{ title: "API & webhooks" }} />;
  if (rid === undefined) return (<>{header}<WhichResort /></>);

  return (
    <>
      {header}
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}
      >
        {minted ? (
          <Card title="Copy this now — it is not shown again">
            <View style={styles.fields}>
              <Text step="small" tone="muted">
                {minted.what}
              </Text>
              <View style={styles.secret}>
                <Text step="small" weight="medium" selectable style={styles.mono}>
                  {minted.secret}
                </Text>
              </View>
              <Button label="Share or copy it" onPress={() => void Share.share({ message: minted.secret })} />
              <Button label="I have it" kind="ghost" onPress={() => setMinted(null)} />
            </View>
          </Card>
        ) : null}

        {said ? (
          <View style={[styles.note, said.ok ? styles.ok : styles.bad]}>
            <Text step="small" weight="medium" tone={said.ok ? "ok" : "danger"}>
              {said.text}
            </Text>
          </View>
        ) : null}

        <Card title="Keys">
          <View style={styles.fields}>
            <Text step="small" tone="muted">
              A key lets your own website show your rooms, rates and free nights — and, if you allow it, take a booking.
            </Text>
            <Field label="What is it for">
              <Input value={name} onChangeText={setName} placeholder="Our website" />
            </Field>
            <View style={styles.chips}>
              <Chip label="Reads only" on={!write} onPress={() => setWrite(false)} />
              <Chip label="Reads and books" on={write} onPress={() => setWrite(true)} />
            </View>
            <Button
              label="Make a key"
              loading={busy === "key"}
              disabled={!name.trim()}
              onPress={async () => {
                const made = await run("key", () => client.apiKeys.create(rid, name.trim(), write ? ["read", "write"] : ["read"]), "Key made");
                if (made) {
                  setMinted({ what: `Key for ${name.trim()}`, secret: (made as { secret: string }).secret });
                  setName("");
                }
              }}
            />
            {keys && keys.length === 0 ? (
              <Text step="small" tone="muted">
                No keys yet.
              </Text>
            ) : null}
            {(keys ?? []).map((k, i) => (
              <Row
                key={k.id}
                title={k.name}
                subtitle={`rm_live_${k.prefix}_… · ${k.scopes?.includes("write") ? "reads and books" : "reads only"}`}
                meta={k.lastUsedAt ? `Last used ${new Date(k.lastUsedAt).toLocaleDateString("en-GB")}` : "Never used"}
                last={i === (keys?.length ?? 0) - 1}
                accessibilityLabel={`${k.name}, ${k.active ? "active" : "revoked"}`}
                right={
                  k.active ? (
                    <Button
                      label="Revoke"
                      kind="danger"
                      block={false}
                      loading={busy === `r${k.id}`}
                      onPress={() =>
                        ask("Revoke this key?", "Anything using it stops working at once.", "Revoke", () =>
                          void run(`r${k.id}`, () => client.apiKeys.revoke(k.id), "Key revoked"),
                        )
                      }
                    />
                  ) : (
                    <Text step="caption" tone="danger" weight="bold">
                      Revoked
                    </Text>
                  )
                }
              />
            ))}
          </View>
        </Card>

        <Card title="Where we tell you things">
          <View style={styles.fields}>
            <Text step="small" tone="muted">
              An address on your server that hears about bookings and payments the moment they happen.
            </Text>
            <Field label="Your address">
              <Input value={url} onChangeText={setUrl} placeholder="https://example.com/hooks/resort" autoCapitalize="none" keyboardType="url" />
            </Field>
            <Button
              label="Add the address"
              loading={busy === "hook"}
              disabled={!/^https?:\/\//.test(url.trim())}
              onPress={async () => {
                const made = await run("hook", () => client.webhooks.add(rid, url.trim()), "Address added");
                if (made) {
                  setMinted({ what: `Signing secret for ${url.trim()}`, secret: (made as { secret: string }).secret });
                  setUrl("");
                }
              }}
            />
            {endpoints.map((e, i) => (
              <Row
                key={e.id}
                title={e.url}
                last={i === endpoints.length - 1}
                accessibilityLabel={e.url}
                right={
                  <Button
                    label="Remove"
                    kind="subtle"
                    block={false}
                    loading={busy === `e${e.id}`}
                    onPress={() => void run(`e${e.id}`, () => client.webhooks.remove(rid, e.id), "Removed")}
                  />
                }
              />
            ))}
            <Text step="small" weight="medium" tone="title">
              What we send
            </Text>
            {WEBHOOK_EVENTS.map((ev) => (
              <Text key={ev.key} step="caption" tone="muted">
                {`${ev.key} — ${ev.blurb}`}
              </Text>
            ))}
          </View>
        </Card>

        <Card title="What we sent, and what came back">
          {deliveries.length === 0 ? (
            <Empty message="Nothing sent yet" />
          ) : (
            deliveries.map((d) => {
              const tone = STATE_TONE[d.state] ?? { bg: color.ink[100], fg: color.muted };
              return (
                <View key={d.id} style={styles.delivery}>
                  <View style={[styles.state, { backgroundColor: tone.bg }]}>
                    <Text step="caption" weight="bold" style={{ color: tone.fg }}>
                      {d.state}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text step="small" weight="medium" tone="title" numberOfLines={1}>
                      {d.event}
                    </Text>
                    <Text step="caption" tone="muted" numberOfLines={2}>
                      {`${new Date(d.createdAt).toLocaleString("en-GB")} · ${d.attempts} ${d.attempts === 1 ? "try" : "tries"}${d.lastStatus != null ? ` · answered ${d.lastStatus}` : ""}${d.lastError ? ` · ${d.lastError}` : ""}`}
                    </Text>
                  </View>
                  {d.state !== "delivered" ? (
                    <Button label="Again" kind="ghost" block={false} loading={busy === `d${d.id}`} onPress={() => void run(`d${d.id}`, () => client.webhooks.retry(rid, d.id), "Sent again")} />
                  ) : null}
                </View>
              );
            })
          )}
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  fields: { gap: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  flex: { flex: 1 },
  secret: { backgroundColor: color.ink[900], borderRadius: radius.md, padding: space.md },
  mono: { color: color.chart.money.paid.soft, fontFamily: "monospace" },
  delivery: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: color.line },
  state: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill },
  note: { borderRadius: radius.md, padding: space.md, borderWidth: 1 },
  ok: { backgroundColor: color.ok.bg, borderColor: color.ok.line },
  bad: { backgroundColor: color.danger.bg, borderColor: color.danger.line },
});
