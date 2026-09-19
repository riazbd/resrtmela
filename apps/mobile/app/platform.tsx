/**
 * Where the platform's own owner lands, and why there is nothing here.
 *
 * `landingFor` sends a SUPER_ADMIN to `/platform`, and the design refuses to
 * build that console natively: it is the platform owner's own tool, two
 * thousand lines of it, and it is used at a desk. Saying so plainly is
 * better than a tab bar with nothing on it, and better than the
 * "Not built yet" that every phase-1 screen shows — because this one is not
 * coming.
 *
 * Signing in still works, which is the point: the owner can check that the
 * app runs, and step into a resort from the desk the way they already do.
 */
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../src/api/session";
import { Button } from "../src/design/button";
import { Text } from "../src/design/text";
import { CONSOLE_URL } from "../src/api/config";
import { space } from "../src/design/tokens";

export default function Platform() {
  const { me, logout } = useAuth();

  return (
    <View style={styles.middle}>
      <Text step="title" weight="bold" tone="title">
        The platform console is on the desk
      </Text>
      <Text step="body" tone="muted" style={styles.centred}>
        Plans, resorts, agencies and billing are run from {CONSOLE_URL.replace(/^https?:\/\//, "")}.
        This app is for the two audiences that work inside a resort.
      </Text>
      {me ? (
        <Text step="small" tone="muted" style={styles.centred}>
          Signed in as {me.name}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          label="Sign out"
          kind="ghost"
          onPress={() => {
            logout();
            router.replace("/login");
          }}
        />
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
  actions: { alignSelf: "stretch", marginTop: space.lg },
});
