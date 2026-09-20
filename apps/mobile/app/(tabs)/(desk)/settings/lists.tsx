/**
 * The lists a resort owns.
 *
 * Payment methods, booking sources, expense categories and the rest.
 * Their *contents* are the resort's — editable, no migration, no deploy —
 * and which lists exist is not, because a list exists only because some
 * code reads it. `GET /option-lists` says which ones there are, so this
 * screen never hardcodes them and a seventh list appears here the day the
 * code that consumes it ships.
 *
 * Why it matters on a phone: every form in the app offers these, and the
 * API refuses a code that is not on the list. An owner who cannot add
 * "Rocket" to the payment methods has a clerk recording a Rocket payment
 * as Cash, and the day's reconciliation is wrong for ever after.
 *
 * Removing is the server's decision, not this screen's. An option in use
 * is deactivated rather than deleted — a booking that was taken through
 * "Facebook" still has to be able to say so — and the reply says which
 * happened.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { keys, useApi, useQueryClient } from "@rh/app-core";
import type { ResortOption } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { WhichResort } from "../../../../src/screens/which-resort";
import { Button } from "../../../../src/design/button";
import { Chip } from "../../../../src/design/chip";
import { Field, Input } from "../../../../src/design/input";
import { Empty, Loading, Problem } from "../../../../src/design/states";
import { Card, Row } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { useAction } from "../../../../src/design/use-action";
import { color, radius, space } from "../../../../src/design/tokens";

export default function ListsScreen() {
  const { activeResort } = useAuth();
  const resortId = activeResort?.id;

  const lists = useApi(["option-lists"], () => client.options.lists(), {
    staleTime: 3_600_000,
  });
  const [chosen, setChosen] = useState<string | null>(null);

  const header = <Stack.Screen options={{ title: "Lists" }} />;

  if (resortId === undefined) {
    return (
      <>
        {header}
        <WhichResort what="the lists" />
      </>
    );
  }

  if (lists.error && !lists.data) {
    return (
      <>
        {header}
        <Problem error={lists.error} onRetry={() => void lists.refetch()} />
      </>
    );
  }

  if (!lists.data) {
    return (
      <>
        {header}
        <Loading what="the lists" />
      </>
    );
  }

  const all = lists.data;
  const list = chosen ?? all[0]?.name ?? null;

  return (
    <>
      {header}
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.kinds}>
          {all.map((l) => (
            <Chip key={l.name} label={l.label} on={list === l.name} onPress={() => setChosen(l.name)} />
          ))}
        </View>

        {list ? <OneList resortId={resortId} list={list} /> : null}
      </ScrollView>
    </>
  );
}

function OneList({ resortId, list }: { resortId: number; list: string }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [tried, setTried] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const options = useApi<ResortOption[]>(
    keys.options(resortId, list),
    () => client.options.list(resortId, list),
    { enabled: true },
  );

  const reload = async () => {
    await options.refetch();
    // every form that offers this list is drawing from the same key
    await qc.invalidateQueries({ queryKey: ["resort-options", resortId] });
    await qc.invalidateQueries({ queryKey: ["expense-categories", resortId] });
  };

  const add = useAction(async () => {
    if (!label.trim()) {
      setTried(true);
      return;
    }
    setRefused(null);
    setNote(null);
    try {
      /**
       * The code is derived from the label, because a person adding
       * "Bank transfer" should not also have to invent `BANK_TRANSFER` —
       * and because a code with a space in it is a code that breaks a
       * query string somewhere downstream.
       */
      const code = label
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      await client.options.create(resortId, list, { code, label: label.trim() });
      setLabel("");
      setTried(false);
      await reload();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  async function remove(option: ResortOption) {
    setRefused(null);
    setNote(null);
    try {
      const answer = await client.options.remove(resortId, list, option.id);
      // an option something already uses is turned off, not deleted: a
      // booking taken through it still has to be able to say so
      setNote(
        answer.deactivated
          ? `${option.label} is in use on ${answer.used} record${answer.used === 1 ? "" : "s"}, so it was switched off rather than removed.`
          : null,
      );
      await reload();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  }

  if (options.error && !options.data) {
    return <Problem error={options.error} onRetry={() => void options.refetch()} />;
  }
  if (!options.data) return <Loading what="the list" />;

  const rows = options.data;

  return (
    <>
      <Card title="On the list">
        {rows.length === 0 ? (
          <View style={styles.emptyBox}>
            <Empty message="Nothing on this list yet" hint="Add the first one below." />
          </View>
        ) : (
          rows.map((option, i) => (
            <Row
              key={option.id}
              title={option.label}
              subtitle={option.active ? undefined : "Switched off — still readable on old records"}
              meta={option.code}
              last={i === rows.length - 1}
              accessibilityLabel={`${option.label}, code ${option.code}${option.active ? "" : ", switched off"}`}
              right={
                <Button
                  label="×"
                  kind="ghost"
                  block={false}
                  accessibilityLabel={`Remove ${option.label}`}
                  onPress={() => void remove(option)}
                />
              }
            />
          ))
        )}
      </Card>

      <Card title="Add one">
        <View style={styles.fields}>
          <Field
            label="What it is called"
            error={tried && !label.trim() ? "Say what it is called." : null}
          >
            <Input
              value={label}
              onChangeText={(text) => {
                setLabel(text);
                if (text.trim()) setTried(false);
              }}
              placeholder="Rocket"
            />
          </Field>
          <Button label="Add" kind="ghost" loading={add.busy} onPress={add.go} />
        </View>
      </Card>

      {note ? (
        <View style={styles.note}>
          <Text step="small" tone="warn" weight="medium">
            {note}
          </Text>
        </View>
      ) : null}

      {refused ? (
        <View style={styles.refused}>
          <Text step="small" tone="danger" weight="medium">
            {refused}
          </Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  kinds: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  fields: { gap: space.md },
  emptyBox: { paddingVertical: space.lg },
  note: {
    backgroundColor: color.warn.bg,
    borderWidth: 1,
    borderColor: color.warn.line,
    borderRadius: radius.md,
    padding: space.md,
  },
  refused: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.md,
    padding: space.md,
  },
});
