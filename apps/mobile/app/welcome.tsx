/**
 * The first screen, for somebody the app has never met.
 *
 * Until now there wasn't one: opening Resort Mela signed out dropped a
 * person straight onto a sign-in form, and phase 4 made that worse by
 * hanging three more buttons off the bottom of it — sign in, see the
 * prices, open a resort, open an agency, and forgot password, all at
 * once, in one column. A form is what you show somebody who has already
 * decided. This is the screen before that.
 *
 * **Three things and one of them is big.** Most people opening this app
 * are staff with an account, so Sign in is the primary and everything
 * else is quieter. The prices are a text link rather than a button
 * because looking at them is browsing, not an action — and dropping a
 * price list on somebody who opened the app to check tonight's arrivals
 * is the fault this screen was written to fix.
 *
 * No marketing paragraph. The one line under the name says what the
 * thing is; anybody who wants the pitch presses the prices.
 */
import { StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import { Button } from "../src/design/button";
import { Text } from "../src/design/text";
import { color, space } from "../src/design/tokens";

export default function WelcomeScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.page}>
        <View style={styles.brand}>
          <Text step="figure" weight="bold" tone="title">
            Resort Mela
          </Text>
          <Text step="body" tone="muted" style={styles.centred}>
            The front desk, in your pocket. Bookings, payments and who is
            arriving today.
          </Text>
        </View>

        <View style={styles.doors}>
          <Button label="Sign in" onPress={() => router.push("/login" as never)} />
          <Button
            label="Create an account"
            kind="subtle"
            onPress={() => router.push("/signup" as never)}
          />
          {/*
            A link, not a button. Looking at prices is browsing; giving it
            the same weight as signing in is how a staff member opening
            the app at seven in the morning meets a price list.
          */}
          <Button
            label="See what it costs"
            kind="ghost"
            onPress={() => router.push("/plans" as never)}
          />
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
  brand: { alignItems: "center", gap: space.sm },
  centred: { textAlign: "center" },
  doors: { gap: space.sm },
});
