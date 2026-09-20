/**
 * A word you can switch on.
 *
 * Where the console uses a `<select>`, a phone uses these: a dropdown on a
 * touch screen is a modal, a scroll and two taps to say one word, and the
 * six booking states fit on two lines as chips.
 *
 * `on` rather than `selected` because these are not exclusive — a screen may
 * have one row of them behaving as a radio and another behaving as
 * checkboxes, and the chip should not pretend to know which.
 */
import { Pressable, StyleSheet } from "react-native";
import { Text } from "./text";
import { TOUCH_TARGET, color, radius, space } from "./tokens";

export function Chip({
  label,
  on,
  onPress,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        on ? styles.on : null,
        pressed && !on ? styles.pressed : null,
      ]}
    >
      <Text step="small" weight="medium" tone={on ? "onBrand" : "body"}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    // shorter than the 44pt floor on purpose: a chip sits in a row of its
    // own kind with a gap around it, so the target a finger meets is the
    // chip plus that gap. `hitSlop` makes that explicit rather than implied.
    minHeight: TOUCH_TARGET - space.md,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  on: { backgroundColor: color.brand[600], borderColor: color.brand[600] },
  pressed: { backgroundColor: color.ink[100] },
});
