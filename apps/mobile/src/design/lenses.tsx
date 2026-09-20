/**
 * A row of ways to look at the same list.
 *
 * Not tabs — tabs change what screen you are on, and these change what
 * question the screen is answering. The console draws the same control above
 * its dues table, and the count rides on each option because a lens that is
 * empty should say so before it is chosen rather than after.
 *
 * The count is asked for, not passed in, so the caller cannot accidentally
 * compute it one way for the label and another way for the rows.
 */
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./text";
import { TOUCH_TARGET, color, radius, space } from "./tokens";

export function Lenses<T extends string>({
  options,
  value,
  onChange,
  countOf,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  countOf?: (option: T) => number;
}) {
  return (
    <View style={styles.bar} accessibilityRole="tablist">
      {options.map((option) => {
        const on = option === value;
        const count = countOf?.(option);
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={count === undefined ? option : `${option}, ${count}`}
            onPress={() => onChange(option)}
            style={({ pressed }) => [
              styles.option,
              on ? styles.on : null,
              pressed && !on ? styles.pressed : null,
            ]}
          >
            {/*
              One line. Without it this bar offered "This month · Last 90
              days · This" — the third option losing its second word to a
              wrap that the row then clipped, while the accessibility tree
              went on reporting "This year" to anything that asked in text.
            */}
            <Text step="small" weight="medium" tone={on ? "onBrand" : "muted"} numberOfLines={1}>
              {option}
            </Text>
            {count === undefined ? null : (
              <Text step="caption" tone={on ? "onBrand" : "muted"} tabular numberOfLines={1}>
                {count}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  option: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
  },
  on: { backgroundColor: color.brand[600] },
  pressed: { backgroundColor: color.ink[50] },
});
