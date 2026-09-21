/**
 * The end of the line for a build the server will not serve (2026-09-21).
 *
 * Resort Mela is not on Play or the App Store, so nothing updates
 * anybody and there is no store to send them to. When the API answers
 * 426 the app arrives here and stops: every other screen would spend
 * its first render making a call that is about to be refused, and a
 * front desk watching six spinners fail is worse than one clear
 * sentence.
 *
 * **No way back, and no Sign out.** A back gesture would land on a
 * screen that 426s again, and signing out solves nothing — the refusal
 * is about the build, not the person. The token is deliberately left
 * alone by the transport so that after installing the new APK they are
 * still signed in.
 *
 * The download address comes from the server rather than from here. An
 * app old enough to be stopped is old enough to have the wrong address
 * baked into it, which is exactly the failure this screen exists to
 * end.
 */
import { useEffect, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import type { AppRelease } from "@rh/shared";
import { Button } from "../src/design/button";
import { Text } from "../src/design/text";
import { color, space } from "../src/design/tokens";
import { APP_VERSION } from "../src/api/config";
import { client } from "../src/api/session";

export default function UpdateRequiredScreen() {
  const [release, setRelease] = useState<AppRelease | null>(null);

  useEffect(() => {
    let alive = true;
    /*
     * `/app/release` is outside the version floor, so this one call
     * still answers a build everything else refuses. If even this
     * fails — no signal, server down — the screen says what it can
     * without it rather than showing nothing.
     */
    client.appRelease()
      .then((r) => alive && setRelease(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <View style={styles.page}>
        <View style={styles.saying}>
          <Text step="figure" weight="bold" tone="title" style={styles.centred}>
            Time to update
          </Text>
          <Text step="body" tone="muted" style={styles.centred}>
            {release
              ? `This app is version ${APP_VERSION || "unknown"}. Resort Mela now needs ${release.minimum} or newer, and ${release.latest} is ready to download.`
              : "This version of Resort Mela is too old to use. Download the latest one to carry on."}
          </Text>
          {release?.notes ? (
            <Text step="small" tone="muted" style={styles.centred}>
              {release.notes}
            </Text>
          ) : null}
        </View>

        <View style={styles.doors}>
          <Button
            label="Download the new version"
            onPress={() => {
              if (release?.downloadUrl) void Linking.openURL(release.downloadUrl);
            }}
            disabled={!release?.downloadUrl}
          />
          {/*
            No "continue anyway" and no "sign out". The first is a lie —
            the server will refuse the next call either way — and the
            second costs them their password for nothing.
          */}
          <Text step="small" tone="muted" style={styles.centred}>
            You will stay signed in after installing it.
          </Text>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: "center",
    padding: space.xl,
    gap: space.xl,
    backgroundColor: color.screen,
  },
  saying: { alignItems: "center", gap: space.sm },
  centred: { textAlign: "center" },
  doors: { gap: space.sm },
});
