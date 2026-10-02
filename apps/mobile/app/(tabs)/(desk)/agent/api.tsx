/**
 * The keys the agency's own website signs its requests with.
 *
 * Minting a key is desk work: the secret is shown **once**, at creation,
 * and never again, so it has to be copied into a config file the moment
 * it appears. Doing that from a phone is how a key ends up in a
 * screenshot.
 *
 * Revoking one is the opposite. The moment you need it — a laptop gone,
 * a developer left, a key in a public repository — you need it from
 * wherever you are standing. So that is the one write here.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, Share, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { useApi } from "@rh/app-core";
import { dayLabel, type AgencyApiKey } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { Button } from "../../../../src/design/button";
import { Chip } from "../../../../src/design/chip";
import { Field, Input } from "../../../../src/design/input";
import { Empty, Loading, Problem } from "../../../../src/design/states";
import { Card, Row } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { color, radius, space } from "../../../../src/design/tokens";

export default function AgentApiScreen() {
  const { me } = useAuth();
  const [refused, setRefused] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [write, setWrite] = useState(false);
  const [minted, setMinted] = useState<{ name: string; secret: string } | null>(null);

  async function create() {
    setRefused(null);
    setBusy("create");
    try {
      const made = await client.agent.apiKeys.create(name.trim(), write ? ["read", "write"] : ["read"]);
      setMinted({ name: name.trim(), secret: made.secret });
      setName("");
      await keys.refetch();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    } finally {
      setBusy(null);
    }
  }

  const keys = useApi<AgencyApiKey[]>(["agent-api-keys"], () => client.agent.apiKeys.list(), {
    enabled: Boolean(me),
  });

  async function revoke(k: AgencyApiKey) {
    setRefused(null);
    setBusy(k.id);
    try {
      await client.agent.apiKeys.revoke(k.id);
      await keys.refetch();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    } finally {
      setBusy(null);
    }
  }

  const header = <Stack.Screen options={{ title: "API" }} />;

  if (keys.error && !keys.data) {
    return (
      <>
        {header}
        <Problem error={keys.error} onRetry={() => void keys.refetch()} />
      </>
    );
  }

  if (!keys.data) {
    return (
      <>
        {header}
        <Loading what="the keys" />
      </>
    );
  }

  const rows = keys.data;
  const live = rows.filter((k) => k.active).length;

  return (
    <>
      {header}
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl refreshing={keys.isRefetching} onRefresh={() => void keys.refetch()} />
        }
      >
        {minted ? (
          <Card title="Copy this now — it is not shown again">
            <View style={styles.gap}>
              <Text step="small" tone="muted">{`Key for ${minted.name}`}</Text>
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

        <Card title="A new key">
          <View style={styles.gap}>
            <Field label="What is it for">
              <Input value={name} onChangeText={setName} placeholder="Our website" />
            </Field>
            <View style={styles.chips}>
              <Chip label="Reads resorts, prices and what is free" on={!write} onPress={() => setWrite(false)} />
              <Chip label="Reads, and makes bookings" on={write} onPress={() => setWrite(true)} />
            </View>
            <Button label="Make the key" loading={busy === "create"} disabled={!name.trim()} onPress={() => void create()} />
          </View>
        </Card>

        <Card title={`${live} key${live === 1 ? "" : "s"} in use`}>
          {rows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty
                message="No keys yet"
                hint="A key is minted at the desk, because its secret is shown once."
              />
            </View>
          ) : (
            rows.map((k, i) => (
              <Row
                key={k.id}
                title={k.name}
                // the prefix is all this route will ever hand back, and it
                // is the only way to tell one row from another
                subtitle={k.prefix}
                meta={[
                  k.scopes.length > 0 ? k.scopes.join(", ") : "no scopes",
                  k.lastUsedAt
                    ? `last used ${dayLabel(k.lastUsedAt, { style: "full" })}`
                    : "never used",
                  k.active ? null : "revoked",
                ]
                  .filter(Boolean)
                  .join(" · ")}
                last={i === rows.length - 1}
                accessibilityLabel={`${k.name}, ${k.prefix}, ${
                  k.active ? "in use" : "revoked"
                }`}
                right={
                  k.active ? (
                    <Button
                      label="Revoke"
                      kind="ghost"
                      block={false}
                      loading={busy === k.id}
                      accessibilityLabel={`Revoke ${k.name}`}
                      onPress={() => void revoke(k)}
                    />
                  ) : (
                    <Text step="small" tone="muted">
                      revoked
                    </Text>
                  )
                }
              />
            ))
          )}
        </Card>

        {refused ? (
          <View style={styles.refused}>
            <Text step="small" tone="danger" weight="medium">
              {refused}
            </Text>
          </View>
        ) : null}

      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  emptyBox: { paddingVertical: space.lg },
  gap: { gap: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  secret: { backgroundColor: color.ink[900], borderRadius: radius.md, padding: space.md },
  mono: { color: color.chart.money.paid.soft, fontFamily: "monospace" },
  refused: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.md,
    padding: space.md,
  },
});
