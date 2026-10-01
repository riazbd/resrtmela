/**
 * What the guests read: the resort's own wording for each message — on the
 * phone, as on the console's "Messages" tab.
 *
 * Words in {braces} are filled in for each guest; under each box is the list
 * that message can use. "Use standard wording" puts the platform's back.
 */
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import type { MessageTemplateRow } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { WhichResort } from "../../../../src/screens/which-resort";
import { refusal } from "../../../../src/screens/payroll-month";
import { Button } from "../../../../src/design/button";
import { Input } from "../../../../src/design/input";
import { Loading } from "../../../../src/design/states";
import { Card } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { color, radius, space } from "../../../../src/design/tokens";

/** The console's names for the four messages. */
const LABELS: Record<string, string> = {
  booking_confirmed: "Booking confirmed",
  booking_received: "Booking request received",
  checkin_reminder: "Check-in reminder (the day before)",
  payment_receipt: "Payment received",
};

export default function MessagesScreen() {
  const { activeResort } = useAuth();
  const rid = activeResort?.id;
  const [rows, setRows] = useState<MessageTemplateRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    if (rid === undefined) return;
    client.templates
      .list(rid)
      .then((r) => {
        setRows(r);
        setDrafts(Object.fromEntries(r.map((x) => [x.name, x.body])));
      })
      .catch((e) => {
        setRows([]);
        setSaid({ ok: false, text: refusal(e) });
      });
  }, [rid]);
  useEffect(() => load(), [load]);

  const header = <Stack.Screen options={{ title: "Messages" }} />;
  if (rid === undefined) return (<>{header}<WhichResort /></>);
  if (!rows) return (<>{header}<Loading what="the messages" /></>);

  async function act(name: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(name);
    setSaid(null);
    try {
      await fn();
      setSaid({ ok: true, text: ok });
      load();
    } catch (e) {
      setSaid({ ok: false, text: refusal(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {header}
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Card title="What your guests read">
          <Text step="small" tone="muted">
            These go out under your resort's name. Write them in Bangla, English or both. Words in {"{braces}"} are filled in for each guest.
          </Text>
        </Card>
        {said ? (
          <Text step="small" weight="medium" tone={said.ok ? "ok" : "danger"}>
            {said.text}
          </Text>
        ) : null}
        {rows.map((r) => (
          <Card key={r.name} title={LABELS[r.name] ?? r.name} action={r.custom ? <View style={styles.yours}><Text step="caption" weight="bold" tone="ok">Yours</Text></View> : null}>
            <View style={styles.fields}>
              <Input
                value={drafts[r.name] ?? ""}
                onChangeText={(t) => setDrafts({ ...drafts, [r.name]: t })}
                multiline
                accessibilityLabel={LABELS[r.name] ?? r.name}
                style={styles.box}
              />
              <Text step="caption" tone="muted">
                {r.placeholders.map((p) => `{${p}}`).join(" · ")}
              </Text>
              <Button label="Save" loading={busy === r.name} onPress={() => void act(r.name, () => client.templates.save(rid, r.name, drafts[r.name] ?? ""), "Saved — new messages use your wording")} />
              {r.custom ? (
                <Button label="Use standard wording" kind="ghost" disabled={busy === r.name} onPress={() => void act(r.name, () => client.templates.reset(rid, r.name), "Back to the standard wording")} />
              ) : null}
            </View>
          </Card>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  fields: { gap: space.sm },
  box: { minHeight: 96, textAlignVertical: "top" },
  yours: { backgroundColor: color.ok.bg, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
});
