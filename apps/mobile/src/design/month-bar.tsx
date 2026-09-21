/**
 * Which month you are looking at, and a way to any other one
 * (2026-09-21).
 *
 * Both calendars moved a month at a time and nothing else. To see next
 * March from September you pressed `›` six times, and to check last
 * year's peak season you pressed `‹` fourteen — which nobody does, so
 * in practice the calendar could only see the month it opened on and
 * the two beside it. The owner asked why, which is the right question:
 * a calendar you cannot navigate is a calendar with one month in it.
 *
 * So the month's own name is the control. Pressing it opens a year and
 * twelve months; the arrows stay, because stepping to next month is
 * still the commonest move by a mile and should not cost a modal.
 *
 * The grid is twelve buttons rather than a wheel: a wheel is three
 * gestures and a confirmation, and every one of them can be
 * mis-flicked. Twelve targets is one tap, and the whole year is visible
 * while you choose — which is the thing a season is judged against.
 *
 * **The arrows may step something smaller.** The room lens moves by
 * week, and giving it its own second row of arrows under this one cost
 * a fifth of the screen to say the same kind of thing twice. It passes
 * its own label and its own steps; the title still opens the year.
 */
import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { MONTHS_LONG, MONTHS_SHORT, monthOf, monthTitle, stepMonth } from "@rh/shared";
import { Text } from "./text";
import { TOUCH_TARGET, color, radius, space } from "./tokens";

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

export function MonthBar({
  month,
  onChange,
  /** The month "today" falls in, so the picker can mark it and offer it. */
  today,
  /** What the bar says. Defaults to the month; the room lens shows its week. */
  label,
  /** What the arrows do. Defaults to a month either way. */
  onStep,
  stepLabels = { back: "Previous month", forward: "Next month" },
}: {
  month: string;
  onChange: (month: string) => void;
  today: string;
  label?: string;
  onStep?: (by: -1 | 1) => void;
  stepLabels?: { back: string; forward: string };
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => Number(month.slice(0, 4)));
  const thisMonth = monthOf(today);

  const choose = (m: string) => {
    onChange(m);
    setOpen(false);
  };

  return (
    <>
      <View style={styles.bar}>
        <Arrow
          icon="chevron-left"
          label={stepLabels.back}
          onPress={() => (onStep ? onStep(-1) : onChange(stepMonth(month, -1)))}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${monthTitle(month)}. Choose another month`}
          onPress={() => {
            setYear(Number(month.slice(0, 4)));
            setOpen(true);
          }}
          style={({ pressed }) => [styles.title, pressed ? styles.pressed : null]}
        >
          {/*
            One line: this Text sits directly in a row, which Android
            measures against infinity and then paints into the box it
            actually got — see `a-word-does-not-fall-off-the-end`.
          */}
          <Text step="strong" weight="medium" tone="title" numberOfLines={1}>
            {label ?? monthTitle(month)}
          </Text>
          <MaterialCommunityIcons name="menu-down" size={20} color={color.muted} />
        </Pressable>
        <Arrow
          icon="chevron-right"
          label={stepLabels.forward}
          onPress={() => (onStep ? onStep(1) : onChange(stepMonth(month, 1)))}
        />
      </View>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        {/*
          Siblings, not nested. The backdrop was wrapping the sheet, so
          every month button was a button inside a button — invalid on
          web, and on native a container that claims to be pressable
          while holding twelve things that are. It sits behind instead,
          filling the screen.

          It closes the sheet, because a sheet with one way out is a
          trap.
        */}
        <View style={styles.stage}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
          />
          <View style={styles.sheet}>
            <View style={styles.years}>
              <Arrow icon="chevron-left" label="Previous year" onPress={() => setYear((y) => y - 1)} />
              <Text step="title" weight="bold" tone="title" tabular numberOfLines={1}>
                {year}
              </Text>
              <Arrow icon="chevron-right" label="Next year" onPress={() => setYear((y) => y + 1)} />
            </View>

            <View style={styles.grid}>
              {MONTHS_SHORT.map((name, i) => {
                const value = `${String(year).padStart(4, "0")}-${String(i + 1).padStart(2, "0")}`;
                const chosen = value === month;
                const now = value === thisMonth;
                return (
                  <Pressable
                    key={name}
                    accessibilityRole="button"
                    accessibilityState={{ selected: chosen }}
                    accessibilityLabel={`${MONTHS_LONG[i]} ${year}${now ? ", this month" : ""}`}
                    onPress={() => choose(value)}
                    style={({ pressed }) => [
                      styles.month,
                      now ? styles.thisMonth : null,
                      chosen ? styles.chosen : null,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Text
                      step="body"
                      weight={chosen ? "bold" : "medium"}
                      tone={chosen ? "onBrand" : "title"}
                      numberOfLines={1}
                    >
                      {name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/*
              The way back, always. Somebody three years deep in a picker
              wants one press to get home, not thirty-six.
            */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go to this month"
              onPress={() => choose(thisMonth)}
              style={({ pressed }) => [styles.today, pressed ? styles.pressed : null]}
            >
              <Text step="body" weight="medium" tone="ok">
                This month
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  arrow: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  title: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
  },
  stage: {
    flex: 1,
    justifyContent: "center",
    padding: space.xl,
    backgroundColor: color.scrim,
  },
  sheet: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  years: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  month: {
    // four to a row, whatever the screen: (100% - 3 gaps) / 4
    width: "22%",
    flexGrow: 1,
    minHeight: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  thisMonth: { borderColor: color.brand[600] },
  chosen: { backgroundColor: color.brand[600], borderColor: color.brand[600] },
  today: {
    minHeight: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: color.brand[50],
  },
  pressed: { opacity: 0.6 },
});
