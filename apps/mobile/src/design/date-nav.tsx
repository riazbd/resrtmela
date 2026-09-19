/**
 * One day at a time.
 *
 * The console pairs two arrows with a date box. A phone has no date box worth
 * typing into — the native picker is three taps and a modal to move one day —
 * so the arrows are the control, sized for a thumb, and the day is spelled
 * out beside them because 09/10 is two different dates depending on who is
 * reading it.
 *
 * "Today" is the resort's today, through `todayIn`, and it disappears when it
 * would do nothing. Bangladesh is UTC+6: a phone left on UTC and a clerk in
 * Bandarban disagree about the date for most of a working morning, and the
 * register they are both looking at is the resort's.
 */
import { Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { addDaysIso, todayIn } from "@rh/shared";
import { Text } from "./text";
import { TOUCH_TARGET, color, radius, space } from "./tokens";

/** "Sunday, 20 September 2026" — the console's own wording. */
function spelled(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function Arrow({
  icon,
  label,
  onPress,
}: {
  icon: "chevron-left" | "chevron-right";
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.arrow, pressed ? styles.pressed : null]}
    >
      <MaterialCommunityIcons name={icon} size={24} color={color.body} />
    </Pressable>
  );
}

export function DateNav({
  value,
  onChange,
  timezone,
  /** Injected so a test can fix the instant; production never passes it. */
  now,
}: {
  value: string;
  onChange: (iso: string) => void;
  timezone?: string;
  now?: Date;
}) {
  const today = todayIn(timezone, now ?? new Date());
  const isToday = value === today;

  return (
    <View style={styles.bar}>
      <Arrow icon="chevron-left" label="Previous day" onPress={() => onChange(addDaysIso(value, -1))} />

      <View style={styles.middle}>
        <Text step="body" weight="medium" tone="title" numberOfLines={1}>
          {spelled(value)}
        </Text>
        {isToday ? (
          <Text step="caption" tone="ok" weight="medium">
            Today
          </Text>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Today"
            onPress={() => onChange(today)}
            hitSlop={space.sm}
          >
            <Text step="caption" tone="muted" weight="medium">
              Back to today
            </Text>
          </Pressable>
        )}
      </View>

      <Arrow icon="chevron-right" label="Next day" onPress={() => onChange(addDaysIso(value, 1))} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.line,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  arrow: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  middle: { flex: 1, alignItems: "center", gap: 2 },
  pressed: { backgroundColor: color.ink[100] },
});
