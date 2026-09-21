/**
 * "There is a newer one" — the polite half of the version floor
 * (2026-09-21).
 *
 * The floor stops a build that is dangerous to keep using. This is the
 * line that means the floor almost never has to: somebody who updates
 * when asked is never somebody who has to be stopped.
 *
 * So it is quiet on purpose. A modal over the day sheet at seven in the
 * morning, announcing a release to a person with a queue at the desk,
 * is how people learn to dismiss everything — including the one that
 * matters. It sits on the More tab, next to the version number, where
 * somebody goes when they are already looking at the app rather than
 * through it.
 *
 * It also shows the version when there is nothing to say, because
 * "which version are you on?" is the first question of every support
 * call and "I don't know" is the usual answer.
 */
import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { appStanding, type AppRelease } from "@rh/shared";
import { Text } from "../design/text";
import { color, radius, space } from "../design/tokens";
import { APP_VERSION } from "../api/config";
import { client } from "../api/session";

export function UpdateOnOffer() {
  const [release, setRelease] = useState<AppRelease | null>(null);

  useEffect(() => {
    let alive = true;
    client
      .appRelease()
      .then((r) => alive && setRelease(r))
      .catch(() => {
        // the platform not answering is not worth a line on this screen:
        // there is nothing useful to say and nothing for them to do
      });
    return () => {
      alive = false;
    };
  }, []);

  /*
   * The same rule the server applies to the same two numbers, so a
   * person is never told "you are fine" here and refused on the next
   * call. `blocked` is not handled: the transport has already replaced
   * the whole screen by then.
   */
  const standing = release ? appStanding(APP_VERSION, release) : null;

  if (standing !== "update") {
    return (
      <Text step="caption" tone="muted" style={styles.plain}>
        {APP_VERSION ? `Version ${APP_VERSION}` : "Development build"}
      </Text>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Update to version ${release!.latest}`}
      onPress={() => void Linking.openURL(release!.downloadUrl)}
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
    >
      <View style={styles.saying}>
        <Text step="body" weight="medium" tone="title" numberOfLines={1}>
          Version {release!.latest} is ready
        </Text>
        <Text step="caption" tone="muted" numberOfLines={2}>
          {release!.notes?.trim() || `You are on ${APP_VERSION}. Tap to download the new one.`}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  plain: { textAlign: "center", paddingTop: space.xs },
  card: {
    backgroundColor: color.brand[50],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.brand[100],
    padding: space.md,
  },
  pressed: { opacity: 0.7 },
  saying: { gap: 2 },
});
