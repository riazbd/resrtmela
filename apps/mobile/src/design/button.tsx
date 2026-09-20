/**
 * A button, in the four kinds the console already has.
 *
 * The names are the console's — primary, ghost, danger, subtle — rather than
 * the design document's guess at them, because a developer moving between
 * the two clients should not have to translate.
 */
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { Text } from "./text";
import { TOUCH_TARGET, color, radius, space } from "./tokens";

export type ButtonKind = "primary" | "ghost" | "danger" | "subtle";

export interface ButtonProps {
  /** What a person reads, and — unless `accessibilityLabel` says
   * otherwise — what a screen reader announces. */
  label: string;
  /**
   * What a screen reader announces instead, when the words on the button
   * are not enough on their own. A row of "×" buttons is the case: every
   * one of them reads the same, and which line each removes is exactly
   * what a listener needs to know.
   */
  accessibilityLabel?: string;
  onPress: () => void;
  kind?: ButtonKind;
  /** Working. The press is refused while this is true — see below. */
  loading?: boolean;
  disabled?: boolean;
  /** Fills its row. The default, because most buttons on a phone do. */
  block?: boolean;
  style?: ViewStyle;
  testID?: string;
}

const ground: Record<ButtonKind, ViewStyle> = {
  primary: { backgroundColor: color.brand[600] },
  danger: { backgroundColor: color.danger.fg },
  ghost: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.ink[300] },
  subtle: { backgroundColor: color.ink[100] },
};

const ink = {
  primary: "onBrand",
  danger: "onBrand",
  ghost: "body",
  subtle: "body",
} as const;

export function Button({
  label,
  accessibilityLabel,
  onPress,
  kind = "primary",
  loading = false,
  disabled = false,
  block = true,
  style,
  testID,
}: ButtonProps) {
  /**
   * A second tap on a button that is already saving is how a booking gets
   * taken twice. Refusing here rather than in each screen's own `busy` flag
   * is the difference between a rule and a habit.
   */
  const refuses = disabled || loading;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: refuses, busy: loading }}
      disabled={refuses}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        ground[kind],
        block ? styles.block : null,
        // pressed is drawn by dimming rather than by a second palette: four
        // kinds times two states is eight colours nobody would keep in step
        pressed && !refuses ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator
            size="small"
            color={kind === "primary" || kind === "danger" ? color.onBrand : color.body}
          />
        ) : null}
        <Text step="body" weight="medium" tone={ink[kind]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    // the floor lives here, once, because a caller who has to remember it is
    // a caller who will forget it
    minHeight: TOUCH_TARGET,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  block: { alignSelf: "stretch" },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
});
