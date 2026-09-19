/**
 * The three shapes every operational screen is built out of.
 *
 * A card with a heading, a figure with a caption under it, and a row that can
 * be tapped. Sixty-eight screens are almost entirely these, and writing them
 * once is what keeps the density even — a card whose padding is a point
 * different from the card above it reads as a mistake even to somebody who
 * cannot say why.
 */
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { Text } from "./text";
import { TOUCH_TARGET, color, radius, space } from "./tokens";

/**
 * A titled block on the screen's ground.
 *
 * `action` is the one control a card is allowed in its heading — "All
 * bookings", "Add". More than one and the heading has become a toolbar, which
 * on a phone means the title has nowhere to go.
 */
export function Card({
  title,
  action,
  children,
  style,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.card, style]}>
      {title ? (
        <View style={styles.cardHead}>
          <Text step="strong" weight="medium" tone="title">
            {title}
          </Text>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/**
 * One number the screen exists to show.
 *
 * The accessible name is `label: value` as one phrase, because a screen
 * reader moving through four of these would otherwise announce "Arrivals",
 * "3", "Departures", "1" as four separate things and leave the listener to
 * pair them up.
 */
export function Stat({
  label,
  value,
  sub,
  tone = "title",
}: {
  label: string;
  /** Already formatted — a percentage, a count, money. This does not format. */
  value: string;
  sub?: string;
  tone?: "title" | "ok" | "danger";
}) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text step="caption" tone="muted">
        {label}
      </Text>
      <Text step="figure" weight="bold" tone={tone} tabular>
        {value}
      </Text>
      {sub ? (
        <Text step="caption" tone="muted" numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A line in a list, which on a phone is usually a button.
 *
 * `accessibilityLabel` is the whole row read as one sentence rather than the
 * four texts inside it, for the same reason `Stat` is: a list of bookings
 * announced field by field is unusable, and the guest's name is the part
 * somebody is listening for.
 */
export function Row({
  title,
  subtitle,
  meta,
  right,
  onPress,
  accessibilityLabel,
  last = false,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel: string;
  /** No rule under the last row: a list does not end in a line. */
  last?: boolean;
}) {
  const body = (
    <View style={[styles.row, last ? null : styles.ruled]}>
      <View style={styles.rowText}>
        <Text step="body" weight="medium" tone="title" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text step="small" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text step="caption" tone="muted" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.line,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    paddingBottom: space.sm,
  },
  stat: {
    flex: 1,
    minWidth: 140,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.line,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.xs,
  },
  row: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    paddingVertical: space.md,
  },
  ruled: { borderBottomWidth: 1, borderBottomColor: color.line },
  rowText: { flex: 1, gap: 2 },
  pressed: { backgroundColor: color.ink[50] },
});
