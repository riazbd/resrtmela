/**
 * A screen that has not been written yet.
 *
 * Phase 0 builds the foundation, and `landingFor` sends a signed-in person
 * to `/dashboard`, `/agent/discover` or `/platform` — none of which exist
 * until phase 1. This stands in for all of them, and it says which one it
 * is standing in for, so an empty tab is never mistaken for a broken one.
 *
 * It also catches a deep link to a screen this build is too old to have,
 * which is the case it will still be earning its keep on long after the
 * phases are done.
 */
import { StyleSheet, View } from "react-native";
import { router, usePathname } from "expo-router";
import { useAuth } from "../src/api/session";
import { Button } from "../src/design/button";
import { Text } from "../src/design/text";
import { space } from "../src/design/tokens";

export default function NotBuiltYet() {
  const path = usePathname();
  const { me, logout } = useAuth();

  return (
    <View style={styles.middle}>
      <Text step="title" weight="bold" tone="title">
        Not built yet
      </Text>
      <Text step="body" tone="muted" style={styles.centred}>
        {path}
      </Text>
      {me ? (
        <Text step="small" tone="muted" style={styles.centred}>
          Signed in as {me.name}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button label="Back" kind="ghost" onPress={() => router.replace("/")} />
        {me ? (
          <Button
            label="Sign out"
            kind="subtle"
            onPress={() => {
              logout();
              router.replace("/login");
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  middle: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
    gap: space.sm,
  },
  centred: { textAlign: "center" },
  actions: { alignSelf: "stretch", gap: space.sm, marginTop: space.lg },
});
