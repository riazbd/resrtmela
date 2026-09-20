/**
 * A yes/no a person flips, with the question beside it.
 *
 * The whole row is the target rather than just the switch. A checkbox on a
 * phone is a 20pt square; the console's "Walk-in (local)" is one because a
 * mouse can hit it. Pressing the words is what people actually do.
 *
 * The row carries the role and the state, and the switch inside it is
 * hidden from the screen reader — otherwise "Walk-in (local), switch, off"
 * is announced twice, once for the row and once for the thing in it.
 */
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { Text } from "./text";
import { TOUCH_TARGET, color, radius, space } from "./tokens";

export function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
    >
      <View style={styles.words}>
        <Text step="body" weight="medium" tone="title">
          {label}
        </Text>
        {hint ? (
          <Text step="caption" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ true: color.brand[600], false: color.ink[300] }}
          thumbColor={color.surface}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
  },
  words: { flex: 1, gap: 2 },
  pressed: { backgroundColor: color.ink[50] },
});
