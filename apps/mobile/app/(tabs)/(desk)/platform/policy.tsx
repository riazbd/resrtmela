/**
 * The billing policy — the console's Billing policy tab on the phone: the
 * windows that decide when trials end, bills are raised and unpaid accounts
 * are suspended, and the sweep that applies them, run by hand.
 */
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { keys, useApi, useQueryClient } from "@rh/app-core";
import { POLICY_FIELDS, type BillingSweepResult } from "@rh/shared";
import { client } from "../../../../src/api/session";
import { Said, useRun } from "../../../../src/screens/platform-kit";
import { Button } from "../../../../src/design/button";
import { Field, Input } from "../../../../src/design/input";
import { Loading } from "../../../../src/design/states";
import { Card } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { space } from "../../../../src/design/tokens";

export default function PlatformPolicy() {
  const qc = useQueryClient();
  const settings = useApi<Record<string, string>>(keys.platform("settings"), () => client.platform.settings());
  const [values, setValues] = useState<Record<string, string>>({});
  const [last, setLast] = useState<BillingSweepResult | null>(null);
  const { run, busy, said } = useRun(() => qc.invalidateQueries({ queryKey: ["platform"] }));
  useEffect(() => {
    if (settings.data) setValues(settings.data);
  }, [settings.data]);

  const header = <Stack.Screen options={{ title: "Billing policy" }} />;
  if (!settings.data) return (<>{header}<Loading what="the policy" /></>);

  return (
    <>
      {header}
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Card title="When the platform acts">
          <View style={styles.gap}>
            <Text step="small" tone="muted">
              Trials end, bills are raised and unpaid accounts are suspended automatically, once an hour. These are the windows that decide when.
            </Text>
            {POLICY_FIELDS.map((f) => (
              <Field key={f.key} label={f.unit ? `${f.label} (${f.unit})` : f.label} hint={f.hint}>
                <Input value={values[f.key] ?? ""} onChangeText={(t) => setValues({ ...values, [f.key]: t })} placeholder={f.placeholder} />
              </Field>
            ))}
            <Said said={said} />
            <Button
              label="Save the policy"
              loading={busy === "save"}
              onPress={() => void run("save", () => client.platform.updateSettings(Object.fromEntries(POLICY_FIELDS.map((f) => [f.key, values[f.key] ?? ""]))), "Policy saved — it applies on the next sweep")}
            />
            <Button
              label="Run the sweep now"
              kind="ghost"
              loading={busy === "sweep"}
              onPress={() =>
                void run(
                  "sweep",
                  async () => setLast(await client.platform.runBillingSweep()),
                  "Swept",
                )
              }
            />
            {last ? (
              <Text step="small" tone="body">
                {`Last run — trials ended ${last.trialsEnded}, bills raised ${last.duesRaised}, overdue ${last.duesOverdue}, suspended ${last.suspended}, resumed ${last.resumed}, notices sent ${last.notices}.`}
              </Text>
            ) : null}
          </View>
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  gap: { gap: space.md },
});
