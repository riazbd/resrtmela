/**
 * The front door: it decides, it does not draw.
 *
 * Three answers, not two, which is the lesson `consoleGate` already records
 * on the console. "Loading" and "not signed in" were one condition there,
 * and everything that failed it saw a spinner — including the platform's own
 * owner, who has no resort because they sell to resorts, and who therefore
 * waited on that spinner for ever.
 */
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { consoleGate, landingFor } from "@rh/shared";
import { useAuth } from "../src/api/session";
import { Text } from "../src/design/text";
import { color, space } from "../src/design/tokens";

export default function Index() {
  const { me, loading, activeResort } = useAuth();
  const gate = consoleGate({ loading, me, activeResort });

  useEffect(() => {
    // the welcome, not the form: a person the app has never met is being
    // asked to decide something, and a sign-in box is the answer to a
    // decision already made
    if (gate === "login") router.replace("/welcome");
    if (gate === "ready" && me) router.replace(landingFor(me.role) as never);
  }, [gate, me]);

  if (gate === "no-resort") {
    return (
      <View style={styles.middle}>
        <Text step="strong" weight="medium" tone="title">
          Your account is not attached to a resort
        </Text>
        {/* locked out, not loading — and told so, which is the whole reason
            `consoleGate` has four answers rather than being a boolean */}
        <Text step="small" tone="muted" style={styles.centred}>
          Ask the resort owner to add you again from Settings → Team. Until
          they do, there is nothing here for you to open.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.middle}>
      <ActivityIndicator color={color.brand[600]} />
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
});
