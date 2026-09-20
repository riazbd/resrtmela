/**
 * What a resort sells besides a bed.
 *
 * Read-and-look, not edit. An activity's weekly pattern is seven rows of
 * start, end and capacity, and generating slots from it turns that
 * pattern into real inventory between two dates — which is a decision
 * with consequences a phone cannot show. What a phone is for is the
 * question asked at the counter: *is the sunset cruise running
 * tomorrow, and is there room on it?*
 *
 * `upcomingSlots` is the honest measure of whether an activity is
 * really running, and it is not the same as `active`: an activity can
 * be switched on with no slots generated, which reads as available
 * everywhere and sells nothing. That gap is drawn rather than hidden.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import {
  addDaysIso,
  dayLabel,
  formatMoney,
  todayIn,
  type Activity,
  type ActivitySlot,
} from "@rh/shared";
import { client, useAuth } from "../src/api/session";
import { WhichResort } from "../src/screens/which-resort";
import { useMoneyFormat } from "../src/design/money";
import { Empty, Loading, Problem, Stale } from "../src/design/states";
import { Card, Row } from "../src/design/surface";
import { Text } from "../src/design/text";
import { color, radius, space } from "../src/design/tokens";

/** As `Date.getUTCDay()` counts them, which is how the API stores them. */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ActivitiesScreen() {
  const { activeResort } = useAuth();
  const resortId = activeResort?.id;
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });

  const [open, setOpen] = useState<number | null>(null);

  const list = useApi<Activity[]>(
    keys.activities(resortId),
    () => client.activities.list(resortId!),
    { enabled: resortId !== undefined },
  );

  const today = todayIn(activeResort?.timezone);
  const slots = useApi<ActivitySlot[]>(
    ["activity-slots", resortId, open],
    () =>
      client.activities.slots(resortId!, open!, {
        from: today,
        to: addDaysIso(today, 14),
        // a slot that has already run is not an answer to "is there room"
        futureOnly: true,
      }),
    { enabled: resortId !== undefined && open !== null },
  );

  const header = <Stack.Screen options={{ title: "Activities" }} />;

  if (resortId === undefined) {
    return (
      <>
        {header}
        <WhichResort what="the activities" />
      </>
    );
  }

  if (list.error && !list.data) {
    return (
      <>
        {header}
        <Problem error={list.error} onRetry={() => void list.refetch()} />
      </>
    );
  }

  if (!list.data) {
    return (
      <>
        {header}
        <Loading what="the activities" />
      </>
    );
  }

  const rows = list.data;

  return (
    <>
      {header}
      <Stale age={list.stale} />
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />
        }
      >
        {rows.length === 0 ? (
          <Card>
            <View style={styles.emptyBox}>
              <Empty
                message="Nothing on offer yet"
                hint="Activities are set up on the desk; what they sell appears here."
              />
            </View>
          </Card>
        ) : (
          rows.map((activity) => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              whole={whole}
              open={open === activity.id}
              onToggle={() => setOpen(open === activity.id ? null : activity.id)}
              slots={open === activity.id ? slots.data ?? null : null}
              loading={open === activity.id && !slots.data && !slots.error}
            />
          ))
        )}

        <Text step="caption" tone="muted" style={styles.footnote}>
          Adding an activity, setting its week and generating its slots stay on
          the desk — a weekly pattern is seven rows, and generating turns it
          into real inventory.
        </Text>
      </ScrollView>
    </>
  );
}

function ActivityCard({
  activity,
  whole,
  open,
  onToggle,
  slots,
  loading,
}: {
  activity: Activity;
  whole: (n: number) => string;
  open: boolean;
  onToggle: () => void;
  slots: ActivitySlot[] | null;
  loading: boolean;
}) {
  const days = activity.schedules
    .filter((s) => s.active !== false)
    .map((s) => WEEKDAYS[s.weekday] ?? "?")
    .join(", ");

  /**
   * Switched on with nothing generated. It reads as available on every
   * screen that offers it and sells nothing, which is the failure this
   * line exists to name.
   */
  const idle = activity.active && activity.upcomingSlots === 0;

  return (
    <Card title={activity.name}>
      {activity.active ? null : (
        <View style={styles.off}>
          <Text step="caption" weight="medium" tone="muted">
            Not on offer
          </Text>
        </View>
      )}
      {idle ? (
        <View style={styles.idle}>
          <Text step="caption" weight="medium" tone="warn">
            On offer with no slots generated — nobody can book it
          </Text>
        </View>
      ) : null}

      <Row
        title="Price"
        meta={`${whole(activity.basePrice)} · ${activity.durationMin} min`}
        accessibilityLabel={`${activity.name}, ${whole(activity.basePrice)} for ${activity.durationMin} minutes`}
      />
      <Row
        title="Takes"
        meta={`${activity.minPerSlot}–${activity.maxPerSlot} people`}
        accessibilityLabel={`Takes ${activity.minPerSlot} to ${activity.maxPerSlot} people`}
      />
      <Row
        title="Runs"
        meta={days || "No weekly pattern"}
        accessibilityLabel={`Runs ${days || "on no weekly pattern"}`}
      />
      <Row
        title="Next"
        meta={activity.nextSlot ? dayLabel(activity.nextSlot) : "—"}
        subtitle={`${activity.upcomingSlots} slot${activity.upcomingSlots === 1 ? "" : "s"} ahead`}
        last={!open}
        accessibilityLabel={`Next ${activity.nextSlot ? dayLabel(activity.nextSlot) : "none"}, ${activity.upcomingSlots} slots ahead`}
        onPress={onToggle}
      />

      {open ? (
        loading ? (
          <Loading what="the slots" />
        ) : !slots || slots.length === 0 ? (
          <View style={styles.emptyBox}>
            <Empty message="No slots in the next fortnight" />
          </View>
        ) : (
          slots.map((slot, i) => (
            <Row
              key={slot.id}
              title={dayLabel(slot.startsAt, { style: "full" })}
              subtitle={`${slot.bookedCount} of ${slot.capacity} taken`}
              last={i === slots.length - 1}
              accessibilityLabel={`${dayLabel(slot.startsAt, { style: "full" })}, ${slot.remaining} of ${slot.capacity} left`}
              right={
                <Text
                  step="body"
                  weight="medium"
                  tone={slot.remaining === 0 ? "danger" : slot.remaining <= 2 ? "warn" : "ok"}
                  tabular
                >
                  {slot.remaining === 0 ? "Full" : `${slot.remaining} left`}
                </Text>
              }
            />
          ))
        )
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  emptyBox: { paddingVertical: space.lg },
  footnote: { textAlign: "center" },
  off: {
    alignSelf: "flex-start",
    backgroundColor: color.ink[100],
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    marginBottom: space.sm,
  },
  idle: {
    backgroundColor: color.warn.bg,
    borderWidth: 1,
    borderColor: color.warn.line,
    borderRadius: radius.md,
    padding: space.sm,
    marginBottom: space.sm,
  },
});
