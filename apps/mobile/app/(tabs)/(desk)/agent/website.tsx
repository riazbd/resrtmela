/**
 * The agency's own page, run from the phone — the console's agency Website
 * page, all of it.
 *
 * This screen said "the pages, the photographs and the colours are written on
 * the desk" until 2026-10-02. The owner: whatever the console has, the app
 * has. So: publish or take down, what it says, the colour, how people reach
 * the agency, which resorts are on the page, the pictures (from the gallery,
 * ordered, removed), the address, and a domain of the agency's own.
 */
import { useCallback, useEffect, useState } from "react";
import { Image, Linking, RefreshControl, ScrollView, Share, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import type { AgencySite } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { CONSOLE_URL } from "../../../../src/api/config";
import { pickPicture, uploadPicture } from "../../../../src/api/upload";
import { OwnDomains } from "../../../../src/screens/own-domains";
import { refusal } from "../../../../src/screens/payroll-month";
import { Button } from "../../../../src/design/button";
import { Chip } from "../../../../src/design/chip";
import { Field, Input } from "../../../../src/design/input";
import { Empty, Loading } from "../../../../src/design/states";
import { Card } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { color, elevation, radius, space } from "../../../../src/design/tokens";

const FIELDS = ["headline", "intro", "themeColor", "phone", "email", "whatsapp", "address", "facebook", "instagram"] as const;
type Words = Record<(typeof FIELDS)[number], string>;

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`);

export default function AgentWebsiteScreen() {
  const { can } = useAuth();
  const [site, setSite] = useState<AgencySite | null>(null);
  const [words, setWords] = useState<Words>(() => Object.fromEntries(FIELDS.map((f) => [f, ""])) as Words);
  const [hidden, setHidden] = useState<number[]>([]);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await client.agent.site();
      setSite(s);
      setWords(Object.fromEntries(FIELDS.map((f) => [f, (s[f] as string | null) ?? ""])) as Words);
      setHidden(s.hiddenResortIds);
      setAddress(s.slug);
    } catch (e) {
      setSaid({ ok: false, text: refusal(e) });
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    setSaid(null);
    try {
      await fn();
      setSaid({ ok: true, text: ok });
      await load();
    } catch (e) {
      setSaid({ ok: false, text: refusal(e) });
    } finally {
      setBusy(null);
    }
  }

  const header = <Stack.Screen options={{ title: "Website" }} />;
  if (!can("agent.website.manage")) return (<>{header}<Empty message="You do not have access to the agency's website" /></>);
  if (!site) return (<>{header}<Loading what="your page" /></>);

  const publicUrl = `${CONSOLE_URL}/a/${site.slug}`;
  const swatch = /^#[0-9a-fA-F]{6}$/.test(words.themeColor) ? words.themeColor : color.brand[600];
  const save = () =>
    run(
      "save",
      () =>
        client.agent.saveSite({
          ...Object.fromEntries(FIELDS.map((f) => [f, words[f].trim() === "" ? null : words[f]])),
          hiddenResortIds: hidden,
        }),
      "Saved",
    );
  const field = (f: (typeof FIELDS)[number]) => ({ value: words[f], onChangeText: (t: string) => setWords({ ...words, [f]: t }) });

  return (
    <>
      {header}
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}
      >
        <View style={[styles.hero, { backgroundColor: swatch }]}>
          {site.photos[0] ? <Image source={{ uri: site.photos[0].url }} style={styles.fill} /> : null}
          <View style={[styles.fill, styles.shade]} />
          <View style={styles.heroBody}>
            <View style={[styles.live, site.published ? styles.liveOn : null]}>
              <Text step="caption" weight="bold" tone={site.published ? "ok" : "muted"}>
                {site.published ? "● Live" : "○ Not published — nobody can see it"}
              </Text>
            </View>
            <Text step="title" weight="bold" tone="onBrand" numberOfLines={2}>
              {words.headline || site.name}
            </Text>
            <Text step="small" tone="onBrand" selectable numberOfLines={1}>
              {publicUrl.replace(/^https?:\/\//, "")}
            </Text>
          </View>
        </View>
        <View style={styles.row}>
          <Button
            label={site.published ? "Take it down" : "Publish"}
            kind={site.published ? "ghost" : "primary"}
            block={false}
            style={styles.flex}
            loading={busy === "publish"}
            onPress={() => void run("publish", () => client.agent.publishSite(!site.published), site.published ? "Your page is off the air" : "Your page is live")}
          />
          <Button label="Open" kind="ghost" block={false} onPress={() => void Linking.openURL(publicUrl)} />
          <Button label="Share" kind="ghost" block={false} onPress={() => void Share.share({ message: publicUrl })} />
        </View>
        {!site.whatsapp && !site.phone ? (
          <Text step="small" tone="warn">
            Your page has no phone or WhatsApp number — a visitor has no way to reach you.
          </Text>
        ) : null}
        {said ? (
          <Text step="small" weight="medium" tone={said.ok ? "ok" : "danger"}>
            {said.text}
          </Text>
        ) : null}

        <Card title="What it says">
          <View style={styles.gap}>
            <Field label="Headline">
              <Input {...field("headline")} placeholder="Tours across Sylhet and Cox's Bazar" />
            </Field>
            <Field label="About your agency">
              <Input {...field("intro")} multiline style={styles.box} />
            </Field>
            <Field label="Your colour" hint="Used for headings and buttons, like #0f5132">
              <View style={styles.row}>
                <View style={[styles.swatch, { backgroundColor: swatch }]} />
                <View style={styles.flex}>
                  <Input {...field("themeColor")} autoCapitalize="none" placeholder="#0f5132" />
                </View>
              </View>
            </Field>
          </View>
        </Card>

        <Card title="How people reach you">
          <View style={styles.gap}>
            <Field label="Phone">
              <Input {...field("phone")} keyboardType="phone-pad" placeholder="01XXX-XXXXXX" />
            </Field>
            <Field label="WhatsApp" hint="With the country code — 8801…">
              <Input {...field("whatsapp")} keyboardType="phone-pad" placeholder="8801XXXXXXXXX" />
            </Field>
            <Field label="Email">
              <Input {...field("email")} keyboardType="email-address" autoCapitalize="none" />
            </Field>
            <Field label="Address">
              <Input {...field("address")} />
            </Field>
            <Field label="Facebook page">
              <Input {...field("facebook")} autoCapitalize="none" placeholder="facebook.com/your-page" />
            </Field>
            <Field label="Instagram">
              <Input {...field("instagram")} autoCapitalize="none" placeholder="instagram.com/your-page" />
            </Field>
          </View>
        </Card>

        <Card title={`Resorts on your page (${site.resorts.length - hidden.length} of ${site.resorts.length})`}>
          {site.resorts.length === 0 ? (
            <Empty message="No resort you sell yet" />
          ) : (
            <View style={styles.chips}>
              {site.resorts.map((r) => (
                <Chip
                  key={r.id}
                  label={r.name}
                  on={!hidden.includes(r.id)}
                  onPress={() => setHidden((h) => (h.includes(r.id) ? h.filter((x) => x !== r.id) : [...h, r.id]))}
                />
              ))}
            </View>
          )}
        </Card>

        <Button label="Save the page" loading={busy === "save"} onPress={() => void save()} />

        <Card title={`Pictures (${site.photos.length})`}>
          <View style={styles.gap}>
            <Button
              label="Add a picture"
              kind="ghost"
              loading={busy === "photo"}
              onPress={async () => {
                try {
                  const picture = await pickPicture();
                  if (!picture) return;
                  await run("photo", () => uploadPicture(client.agent.photoPath(), picture), "Picture added");
                } catch (e) {
                  setSaid({ ok: false, text: refusal(e) });
                }
              }}
            />
            <Text step="caption" tone="muted">{`${size(site.storage.used)} of ${size(site.storage.quota)} used`}</Text>
            {site.photos.length === 0 ? (
              <Empty message="No pictures yet" hint="The first one is the cover." />
            ) : (
              <View style={styles.photos}>
                {site.photos.map((p, i) => (
                  <View key={p.id} style={styles.photo}>
                    <Image source={{ uri: p.url }} style={styles.photoImage} accessibilityLabel={p.alt ?? "A picture"} />
                    <View style={styles.photoActs}>
                      <Button label="‹" kind="subtle" block={false} accessibilityLabel="Move earlier" disabled={i === 0} onPress={() => void run(`m${p.id}`, () => client.agent.movePhoto(p.id, i - 1), "Moved")} />
                      <Button label="›" kind="subtle" block={false} accessibilityLabel="Move later" disabled={i === site.photos.length - 1} onPress={() => void run(`m${p.id}`, () => client.agent.movePhoto(p.id, i + 1), "Moved")} />
                      <Button label="×" kind="subtle" block={false} accessibilityLabel="Remove the picture" onPress={() => void run(`d${p.id}`, () => client.agent.removePhoto(p.id), "Picture removed")} />
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </Card>

        <Card title="The address">
          <View style={styles.gap}>
            <Field label="Your page lives at" hint="Letters, numbers and dashes">
              <Input value={address} onChangeText={setAddress} autoCapitalize="none" />
            </Field>
            <Button label="Change the address" kind="ghost" loading={busy === "address"} disabled={address === site.slug} onPress={() => void run("address", () => client.agent.setSiteAddress(address), "Address changed")} />
          </View>
        </Card>

        <OwnDomains calls={client.agent.domains} blurb="Point your own address at your page — youragency.com instead of ours. The address above keeps working too." />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  gap: { gap: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  flex: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  hero: { height: 180, borderRadius: radius.xl, overflow: "hidden", justifyContent: "flex-end", ...elevation.floating },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  shade: { backgroundColor: color.scrim },
  heroBody: { padding: space.lg, gap: space.xs },
  live: { alignSelf: "flex-start", backgroundColor: color.ink[100], borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
  liveOn: { backgroundColor: color.ok.bg },
  box: { minHeight: 96, textAlignVertical: "top" },
  swatch: { width: 40, height: 40, borderRadius: radius.md, borderWidth: 1, borderColor: color.line },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  photo: { width: "48%", borderRadius: radius.md, overflow: "hidden", backgroundColor: color.ink[100] },
  photoImage: { width: "100%", aspectRatio: 4 / 3 },
  photoActs: { flexDirection: "row", justifyContent: "space-between", padding: space.xs },
});
