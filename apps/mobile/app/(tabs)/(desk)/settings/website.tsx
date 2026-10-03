/**
 * The resort's own website, run from the phone — the console's "Website" tab.
 *
 * Publish it or take it down, choose its design, write what it says, add,
 * order and remove its pictures, choose its address, say how guests reach
 * the resort, and point a domain of the resort's own at it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Linking, Pressable, RefreshControl, ScrollView, Share, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import type { RoomType, SiteDraft } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { CONSOLE_URL } from "../../../../src/api/config";
import { pickPicture, uploadPicture } from "../../../../src/api/upload";
import { WhichResort } from "../../../../src/screens/which-resort";
import { OwnDomains } from "../../../../src/screens/own-domains";
import { refusal } from "../../../../src/screens/payroll-month";
import { Button } from "../../../../src/design/button";
import { Chip } from "../../../../src/design/chip";
import { Field, Input } from "../../../../src/design/input";
import { Empty, Loading } from "../../../../src/design/states";
import { Card } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { color, elevation, radius, space } from "../../../../src/design/tokens";

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`);

export default function WebsiteScreen() {
  const { activeResort } = useAuth();
  const rid = activeResort?.id;
  const [site, setSite] = useState<SiteDraft | null>(null);
  const [types, setTypes] = useState<RoomType[]>([]);
  const [draft, setDraft] = useState({ headline: "", intro: "", amenities: "", themeColor: "", whatsapp: "", facebook: "", instagram: "" });
  const [address, setAddress] = useState("");
  const [attachTo, setAttachTo] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (rid === undefined) return;
    try {
      const s = await client.site.get(rid);
      setSite(s);
      setDraft({
        headline: s.headline ?? "",
        intro: s.intro ?? "",
        amenities: s.amenities.join(", "),
        themeColor: s.themeColor ?? "",
        whatsapp: s.whatsapp ?? "",
        facebook: s.facebook ?? "",
        instagram: s.instagram ?? "",
      });
      setAddress(s.slug);
    } catch (e) {
      setSaid({ ok: false, text: refusal(e) });
    }
    client.rooms.types(rid).then(setTypes).catch(() => setTypes([]));
  }, [rid]);
  useEffect(() => void load(), [load]);

  const domainCalls = useMemo(
    () =>
      rid === undefined
        ? null
        : {
            list: () => client.domains.list(rid),
            claim: (host: string) => client.domains.claim(rid, host),
            verify: (id: number) => client.domains.verify(rid, id),
            setCanonical: (id: number) => client.domains.setCanonical(rid, id),
            remove: (id: number) => client.domains.remove(rid, id),
          },
    [rid],
  );

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
  if (rid === undefined) return (<>{header}<WhichResort /></>);
  if (!site) return (<>{header}<Loading what="the website" /></>);

  const publicUrl = `${CONSOLE_URL}/r/${site.slug}`;
  const swatch = /^#[0-9a-fA-F]{6}$/.test(draft.themeColor) ? draft.themeColor : color.brand[600];

  return (
    <>
      {header}
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}
      >
        <View style={[styles.hero, { backgroundColor: swatch }]}>
          {site.photos[0] ? <Image source={{ uri: site.photos[0].url }} style={styles.heroImage} /> : null}
          <View style={styles.heroShade} />
          <View style={styles.heroBody}>
            <View style={[styles.live, site.published ? styles.liveOn : null]}>
              <Text step="caption" weight="bold" tone={site.published ? "ok" : "muted"}>
                {site.published ? "● Live" : "○ Not published"}
              </Text>
            </View>
            <Text step="title" weight="bold" tone="onBrand" numberOfLines={2}>
              {draft.headline || activeResort?.name || "Your website"}
            </Text>
            <Text step="small" tone="onBrand" numberOfLines={1} selectable>
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
            onPress={() => void run("publish", () => client.site.publish(rid, !site.published), site.published ? "Your site is off the air" : "Your site is live")}
          />
          <Button label="Open" kind="ghost" block={false} onPress={() => void Linking.openURL(publicUrl)} />
          <Button label="Share" kind="ghost" block={false} onPress={() => void Share.share({ message: publicUrl })} />
        </View>

        {said ? (
          <Text step="small" weight="medium" tone={said.ok ? "ok" : "danger"}>
            {said.text}
          </Text>
        ) : null}

        <Card title="The design">
          <View style={styles.gap}>
            {site.templates.map((t) => {
              const on = site.template === t.key;
              return (
                <Pressable
                  key={t.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => !on && void run(`t${t.key}`, () => client.site.save(rid, { template: t.key }), "Design changed")}
                  style={[styles.template, on ? styles.templateOn : null]}
                >
                  <Text step="body" weight="bold" tone={on ? "ok" : "title"}>
                    {`${on ? "✓ " : ""}${t.label}`}
                  </Text>
                  <Text step="caption" tone="muted">
                    {t.blurb}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card title="What it says">
          <View style={styles.gap}>
            <Field label="Headline">
              <Input value={draft.headline} onChangeText={(t) => setDraft({ ...draft, headline: t })} placeholder="Tea gardens, ten minutes from town" />
            </Field>
            <Field label="About your resort">
              <Input value={draft.intro} onChangeText={(t) => setDraft({ ...draft, intro: t })} multiline placeholder="What is it like to be here?" style={styles.box} />
            </Field>
            <Field label="What you offer" hint="Separated by commas — Wi-Fi, Parking, Breakfast">
              <Input value={draft.amenities} onChangeText={(t) => setDraft({ ...draft, amenities: t })} />
            </Field>
            <Field label="Your colour" hint="Used for headings and buttons, like #0f5132">
              <View style={styles.row}>
                <View style={[styles.swatch, { backgroundColor: swatch }]} />
                <View style={styles.flex}>
                  <Input value={draft.themeColor} onChangeText={(t) => setDraft({ ...draft, themeColor: t })} autoCapitalize="none" placeholder="#0f5132" />
                </View>
              </View>
            </Field>
            <Button
              label="Save"
              loading={busy === "save"}
              onPress={() =>
                void run(
                  "save",
                  () =>
                    client.site.save(rid, {
                      headline: draft.headline,
                      intro: draft.intro,
                      amenities: draft.amenities.split(",").map((a) => a.trim()).filter(Boolean),
                      themeColor: draft.themeColor,
                    }),
                  "Saved — your site is updated",
                )
              }
            />
          </View>
        </Card>

        <Card title={`Pictures (${site.photos.length})`}>
          <View style={styles.gap}>
            <Text step="small" weight="medium" tone="title">
              This picture is of
            </Text>
            <View style={styles.chips}>
              <Chip label="The resort" on={attachTo == null} onPress={() => setAttachTo(null)} />
              {types.map((t) => (
                <Chip key={t.id} label={t.name} on={attachTo === t.id} onPress={() => setAttachTo(t.id)} />
              ))}
            </View>
            <Button
              label="Add a picture"
              loading={busy === "photo"}
              onPress={async () => {
                try {
                  const picture = await pickPicture();
                  if (!picture) return;
                  await run("photo", () => uploadPicture(client.site.photoPath(rid), picture, attachTo != null ? { "x-room-type": String(attachTo) } : {}), "Picture added");
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
                    {i === 0 ? (
                      <View style={styles.cover}>
                        <Text step="caption" weight="bold" tone="onBrand">
                          Cover
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.photoActs}>
                      <Button label="‹" kind="subtle" block={false} accessibilityLabel="Move earlier" disabled={i === 0} onPress={() => void run(`m${p.id}`, () => client.site.movePhoto(rid, p.id, i - 1), "Moved")} />
                      <Button label="›" kind="subtle" block={false} accessibilityLabel="Move later" disabled={i === site.photos.length - 1} onPress={() => void run(`m${p.id}`, () => client.site.movePhoto(rid, p.id, i + 1), "Moved")} />
                      <Button label="×" kind="subtle" block={false} accessibilityLabel="Remove the picture" onPress={() => void run(`d${p.id}`, () => client.site.removePhoto(rid, p.id), "Picture removed")} />
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </Card>

        <Card title="The address">
          <View style={styles.gap}>
            <Field label="Your site lives at" hint="Letters, numbers and dashes">
              <Input value={address} onChangeText={setAddress} autoCapitalize="none" />
            </Field>
            <Button label="Change the address" kind="ghost" loading={busy === "address"} disabled={address === site.slug} onPress={() => void run("address", () => client.site.setAddress(rid, address), "Address changed")} />
          </View>
        </Card>

        <Card title="How guests reach you">
          <View style={styles.gap}>
            <Field label="WhatsApp number">
              <Input value={draft.whatsapp} onChangeText={(t) => setDraft({ ...draft, whatsapp: t })} keyboardType="phone-pad" placeholder="8801700000000" />
            </Field>
            <Field label="Facebook page">
              <Input value={draft.facebook} onChangeText={(t) => setDraft({ ...draft, facebook: t })} autoCapitalize="none" placeholder="facebook.com/your-page" />
            </Field>
            <Field label="Instagram">
              <Input value={draft.instagram} onChangeText={(t) => setDraft({ ...draft, instagram: t })} autoCapitalize="none" placeholder="instagram.com/your-page" />
            </Field>
            <Button
              label="Save"
              kind="ghost"
              loading={busy === "reach"}
              onPress={() => void run("reach", () => client.site.save(rid, { whatsapp: draft.whatsapp, facebook: draft.facebook, instagram: draft.instagram }), "Saved")}
            />
          </View>
        </Card>

        {domainCalls ? (
          <OwnDomains calls={domainCalls} blurb="Point your own address at your site — yourresort.com instead of ours. You keep the address above as well; both work." />
        ) : null}
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
  heroImage: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  heroShade: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color.scrim },
  heroBody: { padding: space.lg, gap: space.xs },
  live: { alignSelf: "flex-start", backgroundColor: color.ink[100], borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
  liveOn: { backgroundColor: color.ok.bg },
  template: { borderWidth: 1, borderColor: color.line, borderRadius: radius.md, padding: space.md, gap: 2 },
  templateOn: { borderColor: color.ink[900], backgroundColor: color.ok.bg },
  box: { minHeight: 96, textAlignVertical: "top" },
  swatch: { width: 40, height: 40, borderRadius: radius.md, borderWidth: 1, borderColor: color.line },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  photo: { width: "48%", borderRadius: radius.md, overflow: "hidden", backgroundColor: color.ink[100] },
  photoImage: { width: "100%", aspectRatio: 4 / 3 },
  cover: { position: "absolute", top: space.xs, left: space.xs, backgroundColor: color.brand[600], borderRadius: radius.pill, paddingHorizontal: space.sm },
  photoActs: { flexDirection: "row", justifyContent: "space-between", padding: space.xs },
});
