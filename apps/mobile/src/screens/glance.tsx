/**
 * The figures and shares above a list — the console's `components/glance.tsx`
 * on the phone. The sums are `@rh/shared`'s `bookingsGlance`, `guestsGlance`
 * and `roomsGlance`, so both clients draw the same shares from the same rows.
 */
import { Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  bookingsGlance,
  guestsGlance,
  housekeepingLabel,
  nextHousekeepingState,
  roomsGlance,
  type BookingRow,
  type GuestRow,
  type HousekeepingRow,
  type Room,
} from "@rh/shared";
import { BarList, Kpi, Shares, SplitBar } from "../design/charts";
import { Card } from "../design/surface";
import { Text } from "../design/text";
import { color, radius, space } from "../design/tokens";

export function BookingsGlance({ rows, total, money, sourceLabel }: { rows: BookingRow[]; total: number; money: (n: number) => string; sourceLabel?: (code: string) => string }) {
  if (rows.length === 0) return null;
  const g = bookingsGlance(rows, sourceLabel);
  return (
    <>
      <View style={styles.figures}>
        <Kpi label="Collected" value={money(g.paid)} tint={color.chart.money.paid.solid} sub={`${g.nights} nights sold`} />
        <Kpi label="Still due" value={money(g.due)} tint={g.due > 0 ? color.chart.money.late.solid : color.ink[400]} sub={total > rows.length ? `The newest ${rows.length} of ${total}` : `All ${rows.length}`} />
      </View>
      <Card title="At a glance">
        <View style={styles.gap}>
          <Text step="caption" weight="bold" tone="muted">
            WHERE THEY STAND
          </Text>
          <SplitBar format={(n) => String(n)} parts={g.byState} />
          <Text step="caption" weight="bold" tone="muted">
            HOW MUCH IS PAID
          </Text>
          <SplitBar format={(n) => String(n)} parts={g.byPayment} />
          <Text step="caption" weight="bold" tone="muted">
            WHERE THEY CAME FROM
          </Text>
          <BarList format={(n) => String(n)} rows={g.bySource.map((s) => ({ label: s.label, value: s.value, color: s.color }))} limit={4} />
        </View>
      </Card>
    </>
  );
}

export function GuestsGlance({ rows, total }: { rows: GuestRow[]; total: number }) {
  if (rows.length === 0) return null;
  const g = guestsGlance(rows.map((r) => ({ bookings: r.bookingCount })));
  const top = [...rows].sort((a, b) => b.bookingCount - a.bookingCount).slice(0, 4);
  return (
    <Card title="Who comes back">
      <View style={styles.gap}>
        <Shares format={(n) => String(n)} parts={g.loyalty} />
        <Text step="caption" tone="muted">
          {total > rows.length ? `Of the ${rows.length} shown (${total} guests in all)` : `Of all ${rows.length} guests`}
        </Text>
        <Text step="caption" weight="bold" tone="muted">
          MOST STAYS
        </Text>
        {/* a picture of the list below, which is what a screen reader reads */}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <BarList format={(n) => `${n} stay${n === 1 ? "" : "s"}`} rows={top.map((r) => ({ label: r.fullName, sub: r.phone, value: r.bookingCount }))} />
        </View>
      </View>
    </Card>
  );
}

export function RoomsGlance({ rooms, money }: { rooms: Room[]; money: (n: number) => string }) {
  if (rooms.length === 0) return null;
  const g = roomsGlance(rooms);
  return (
    <>
      <View style={styles.figures}>
        <Kpi label="On sale" value={`${g.onSale}/${g.count}`} tint={color.chart.money.paid.solid} sub={`${g.outOfService} out of service`} />
        <Kpi label="Average rate" value={money(g.average)} tint={color.chart.money.income.solid} sub={`${money(g.lowest)} – ${money(g.highest)}`} />
      </View>
      <Card title="Rooms by type">
        <BarList format={(n) => String(n)} rows={g.byType.map((t) => ({ label: t.label, sub: `${money(t.average)} a night on average`, value: t.value, color: t.color }))} />
      </Card>
    </>
  );
}

/** Every room as a tile, coloured by where housekeeping has it; pressed, it moves on. */
export function RoomBoard({ rooms, onMove, busy }: { rooms: HousekeepingRow[]; onMove?: (room: HousekeepingRow) => void; busy?: number | null }) {
  if (rooms.length === 0) return null;
  return (
    <Card title="The floor">
      <View style={styles.board}>
        {rooms.map((r) => {
          const tone = color.chart.housekeeping[r.housekeeping] ?? color.chart.money.neutral;
          const icon = r.housekeeping === "CLEAN" ? "auto-fix" : r.housekeeping === "CLEANING" ? "broom" : "bed-empty";
          return (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              accessibilityLabel={`On the floor: ${r.name} — ${housekeepingLabel(r.housekeeping)}${onMove ? `. ${nextHousekeepingState(r.housekeeping).label}` : ""}`}
              disabled={!onMove || busy === r.id}
              onPress={() => onMove?.(r)}
              style={({ pressed }) => [styles.tile, { backgroundColor: tone.soft, borderTopColor: tone.solid }, pressed && styles.pressed]}
            >
              {/* the tile's label says all of this; read twice, it is noise */}
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.tileWords}>
              <MaterialCommunityIcons name={icon} size={18} color={tone.solid} />
              <Text step="strong" weight="bold" tone="title" numberOfLines={1}>
                {r.name}
              </Text>
              <Text step="caption" weight="bold" numberOfLines={1} style={{ color: tone.solid }}>
                {housekeepingLabel(r.housekeeping)}
              </Text>
              {r.arrivingToday || r.status !== "ACTIVE" ? (
                <Text step="caption" tone="muted" numberOfLines={1}>
                  {r.status !== "ACTIVE" ? "Out of service" : "Arriving today"}
                </Text>
              ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  gap: { gap: space.sm },
  board: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tile: { width: "31%", minHeight: 92, padding: space.sm, borderRadius: radius.md, borderTopWidth: 4, gap: 2 },
  tileWords: { gap: 2 },
  pressed: { opacity: 0.7 },
});
