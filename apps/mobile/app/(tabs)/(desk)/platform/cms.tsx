/**
 * The front page and the brand — the console's Website CMS tab on the phone:
 * the platform's name, icon and logo, and every line of the public homepage
 * that can change without a deploy. Empty falls back to the built-in words.
 */
import { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { keys, useApi, useQueryClient } from "@rh/app-core";
import { CMS_FIELDS, type CmsRow } from "@rh/shared";
import { client } from "../../../../src/api/session";
import { pickPictureAsDataUrl } from "../../../../src/api/upload";
import { Said, useRun } from "../../../../src/screens/platform-kit";
import { refusal } from "../../../../src/screens/payroll-month";
import { Button } from "../../../../src/design/button";
import { Field, Input } from "../../../../src/design/input";
import { Loading } from "../../../../src/design/states";
import { Card } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { color, radius, space } from "../../../../src/design/tokens";

export default function PlatformCms() {
  const qc = useQueryClient();
  const cms = useApi<CmsRow[]>(keys.platform("cms"), () => client.platform.cms());
  const [values, setValues] = useState<Record<string, string>>({});
  const { run, busy, said, setSaid } = useRun(() => qc.invalidateQueries({ queryKey: ["platform", "cms"] }));
  useEffect(() => {
    if (cms.data) setValues(Object.fromEntries(cms.data.map((r) => [r.key, r.value])));
  }, [cms.data]);

  const header = <Stack.Screen options={{ title: "Website CMS" }} />;
  if (!cms.data) return (<>{header}<Loading what="the front page" /></>);

  const save = (key: string, value: string, ok: string) => run(key, () => client.platform.setCms(key, value), ok);
  async function picture(key: "brand.icon" | "brand.logo") {
    try {
      const dataUrl = await pickPictureAsDataUrl();
      if (dataUrl) await save(key, dataUrl, key === "brand.icon" ? "Icon saved" : "Logo saved");
    } catch (e) {
      setSaid({ ok: false, text: refusal(e) });
    }
  }

  return (
    <>
      {header}
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Said said={said} />
        <Card title="The brand">
          <View style={styles.gap}>
            <Field label="Platform name">
              <Input value={values["brand.name"] ?? ""} onChangeText={(t) => setValues({ ...values, "brand.name": t })} />
            </Field>
            <Button label="Save the name" kind="ghost" loading={busy === "brand.name"} onPress={() => void save("brand.name", values["brand.name"] ?? "", "Name saved")} />
            {(["brand.icon", "brand.logo"] as const).map((key) => (
              <View key={key} style={styles.brandRow}>
                <View style={styles.preview}>
                  {values[key] ? <Image source={{ uri: values[key] }} style={styles.previewImage} resizeMode="contain" /> : <Text step="caption" tone="muted">built-in</Text>}
                </View>
                <View style={styles.flex}>
                  <Text step="small" weight="medium" tone="title">
                    {key === "brand.icon" ? "Icon" : "Logo"}
                  </Text>
                  <View style={styles.chips}>
                    <Button label={values[key] ? "Replace" : "Upload"} kind="ghost" block={false} loading={busy === key} onPress={() => void picture(key)} />
                    {values[key] ? <Button label="Use the built-in" kind="subtle" block={false} onPress={() => void save(key, "", "Back to the built-in")} /> : null}
                  </View>
                </View>
              </View>
            ))}
          </View>
        </Card>
        <Card title="The front page">
          <View style={styles.gap}>
            <Text step="small" tone="muted">
              Edit the public homepage without a deploy. Empty falls back to the built-in words.
            </Text>
            {CMS_FIELDS.map((f) => (
              <View key={f.key} style={styles.gap}>
                <Field label={f.label} hint={f.hint}>
                  <Input value={values[f.key] ?? ""} onChangeText={(t) => setValues({ ...values, [f.key]: t })} multiline />
                </Field>
                <Button label="Save" kind="ghost" loading={busy === f.key} onPress={() => void save(f.key, values[f.key] ?? "", "Saved — refresh the homepage to see it")} />
              </View>
            ))}
          </View>
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  gap: { gap: space.md },
  flex: { flex: 1, gap: space.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  brandRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  preview: { width: 64, height: 64, borderRadius: radius.md, borderWidth: 1, borderColor: color.line, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  previewImage: { width: 60, height: 60 },
});
