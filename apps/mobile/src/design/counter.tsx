/**
 * A small whole number, set with two thumbs rather than a keyboard.
 *
 * Adults, children, extra persons. The console uses `<input type="number">`,
 * which on a phone opens the numeric keyboard over half the screen so that
 * somebody can change a 2 into a 3. Two buttons and a figure is one tap.
 *
 * The bounds are enforced here rather than by the caller, because the
 * caller that forgets is the one that sends `extraPersons: 4` to a resort
 * whose rooms take three and gets a refusal the guest has to wait through.
 */
import { Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text } from "./text";
import { TOUCH_TARGET, color, radius, space } from "./tokens";

function Step({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: "minus" | "plus";
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.step, pressed && !disabled ? styles.pressed : null]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={20}
        color={disabled ? color.disabled : color.body}
      />
    </Pressable>
  );
}

export function Counter({
  label,
  value,
  onChange,
  min = 0,
  max = 99,
}: {
  /** Names the two buttons: "One more adult", "One fewer adult". */
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <View style={styles.row}>
      <Step
        icon="minus"
        label={`One fewer ${label}`}
        disabled={value <= min}
        onPress={() => onChange(clamp(value - 1))}
      />
      <Text step="strong" weight="medium" tone="title" tabular accessibilityLabel={`${value}`}>
        {value}
      </Text>
      <Step
        icon="plus"
        label={`One more ${label}`}
        disabled={value >= max}
        onPress={() => onChange(clamp(value + 1))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    paddingHorizontal: space.xs,
  },
  step: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  pressed: { backgroundColor: color.ink[100] },
});
