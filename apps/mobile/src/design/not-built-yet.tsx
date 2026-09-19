/**
 * A screen phase 0 has reached but not yet filled.
 *
 * The tab bar and the session are what phase 0 builds; the thirteen screens
 * behind the resort tabs are phase 1. Until then each tab lands here and
 * says which screen it is standing in for, so an empty tab is never mistaken
 * for a broken one — and so the shell can be opened on a real phone and
 * navigated before a single list exists.
 */
import { StyleSheet, View } from "react-native";
import { Text } from "./text";
import { space } from "./tokens";

export function NotBuiltYet({ screen, note }: { screen: string; note?: string }) {
  return (
    <View style={styles.middle}>
      <Text step="title" weight="bold" tone="title">
        {screen}
      </Text>
      <Text step="body" tone="muted" style={styles.centred}>
        {note ?? "This screen arrives in phase 1."}
      </Text>
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
