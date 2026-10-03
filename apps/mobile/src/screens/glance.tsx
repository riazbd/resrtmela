/**
 * The figures and shares above a list — the console's `components/glance.tsx`
 * on the phone. The sums are `@rh/shared`'s `bookingsGlance`, `guestsGlance`
 * and `roomsGlance`, so both clients draw the same shares from the same rows.
 */
import { Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  activitiesGlance,
  billParts,
  bookingsGlance,
  calendarGlance,
  daySheetGlance,
  fbGlance,
  salesGlance,
  sharesBy,
  stayNights,
  walletGlance,
  guestsGlance,
  housekeepingLabel,
  nextHousekeepingState,
  roomsGlance,
  type BookingRow,
  type GuestRow,
  type HousekeepingRow,
  type Room,
} from "@rh/shared";
import { BarList, Columns, Kpi, Shares, SplitBar } from "../design/charts";
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
              style={({ pressed }) => [styles.tile, { backgroundColor: tone.soft }, pressed && styles.pressed]}
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

const dayNo = (d: string) => String(Number(d.slice(8, 10)));

/** How full the calendar's stretch is, night by night. */
export function CalendarGlance({ occupancy, sellable, bookings }: { occupancy: { day: string; taken: number }[]; sellable: number; bookings: { checkIn: string; state: string }[] }) {
  if (occupancy.length === 0 || sellable === 0) return null;
  const g = calendarGlance(occupancy, sellable, bookings);
  return (
    <Card title={`${g.pct}% full`}>
      <View style={styles.gap}>
        <Columns
          height={110}
          format={(n) => String(n)}
          formatFull={(n) => `${n} of ${sellable} rooms`}
          series={[{ key: "sold", label: "Sold", color: color.chart.money.paid.solid }, { key: "free", label: "Free", color: color.chart.money.paid.soft }]}
          data={occupancy.map((d) => ({ label: dayNo(d.day), title: d.day, values: { sold: d.taken, free: Math.max(0, sellable - d.taken) } }))}
        />
        <Text step="caption" tone="muted">{`${g.free} room-nights still to sell · ${g.fullNights} sold out · ${g.arrivals} arrivals`}</Text>
      </View>
    </Card>
  );
}

/** Tonight on the day sheet: the house in shares, and what each room earns. */
export function DaySheetGlance({ rooms, money }: { rooms: Parameters<typeof daySheetGlance>[0]; money: (n: number) => string }) {
  if (rooms.length === 0) return null;
  const g = daySheetGlance(rooms);
  return (
    <Card title="The house tonight">
      <View style={styles.gap}>
        <SplitBar format={(n) => String(n)} parts={g.parts} />
        {g.earning.length > 0 ? (
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <BarList format={money} barColor={color.chart.money.income.solid} rows={g.earning.map((r) => ({ label: r.label, value: r.value }))} limit={5} />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

/** What the restaurant sold over the range. */
export function FbGlance({ bills, money }: { bills: Parameters<typeof fbGlance>[0]; money: (n: number) => string }) {
  if (bills.length === 0) return null;
  const g = fbGlance(bills);
  return (
    <>
      <View style={styles.figures}>
        <Kpi label="Sold" value={money(g.total)} tint={color.chart.money.income.solid} sub={`${g.count} bill${g.count === 1 ? "" : "s"}`} />
        <Kpi label="Still due" value={money(g.due)} tint={g.due > 0 ? color.chart.money.late.solid : color.ink[400]} sub={`${money(g.paid)} collected`} />
      </View>
      <Card title="Day by day">
        <View style={styles.gap}>
          <Columns height={110} formatFull={money} series={[{ key: "sold", label: "Sold", color: color.chart.money.income.solid }]} data={g.byDay.map((d) => ({ label: dayNo(d.day), title: d.day, values: { sold: d.value } }))} />
          <SplitBar format={money} parts={g.where} />
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <BarList format={money} barColor={color.chart.money.income.solid} rows={g.items} limit={5} />
          </View>
        </View>
      </Card>
    </>
  );
}

/** The week's seats per weekday, and the catalogue by kind. */
export function ActivitiesGlance({ acts, categoryLabel }: { acts: Parameters<typeof activitiesGlance>[0]; categoryLabel?: (code: string) => string }) {
  if (acts.length === 0) return null;
  const g = activitiesGlance(acts, categoryLabel);
  return (
    <Card title="Seats each week">
      <View style={styles.gap}>
        <Columns height={100} format={(n) => String(n)} formatFull={(n) => `${n} seats`} series={[{ key: "seats", label: "Seats", color: color.chart.money.advance.solid }]} data={g.seats.map((s) => ({ label: s.label, values: { seats: s.value } }))} />
        <SplitBar format={(n) => String(n)} parts={g.byCategory} />
        <Text step="caption" tone="muted">{`${g.onSale} on sale · ${g.paused} paused · ${g.upcoming} slots coming up`}</Text>
      </View>
    </Card>
  );
}

/** A stay's nights as a strip — behind, tonight, still to come. */
export function NightStrip({ checkIn, checkOut, today }: { checkIn: string | null; checkOut: string | null; today: string }) {
  const nights = stayNights(checkIn, checkOut, today);
  if (nights.length === 0) return null;
  return (
    <View accessible accessibilityLabel={`${nights.length} night${nights.length === 1 ? "" : "s"}`} style={styles.nights}>
      {nights.map((n) => {
        const t = color.chart.night[n.when];
        return (
          <View key={n.day} style={[styles.night, { backgroundColor: t.soft }]}>
            <Text step="caption" weight="bold" style={{ color: t.solid }}>
              {n.weekday}
            </Text>
            <Text step="strong" weight="bold" tone="title">
              {String(n.date)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** What a bill is made of, and how much of it is paid. */
export function BillPicture({ bill, paid, money, paidLabel = "Paid" }: { bill: { roomRent: number; rent: number; tax: number; total: number }; paid: number; money: (n: number) => string; paidLabel?: string }) {
  const p = billParts(bill, paid);
  return (
    <View style={styles.gap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SplitBar format={money} parts={p.made} />
      <SplitBar format={money} parts={p.money.map((m) => (m.key === "paid" ? { ...m, label: paidLabel } : m))} />
    </View>
  );
}

/** An agency's guests: who comes back, and who has spent the most. */
export function AgencyGuestsGlance({ rows, money }: { rows: { fullName: string; bookings: number; spend: number }[]; money: (n: number) => string }) {
  if (rows.length === 0) return null;
  const g = guestsGlance(rows);
  const top = [...rows].sort((a, b) => b.spend - a.spend).slice(0, 4);
  return (
    <Card title="Who comes back">
      <View style={styles.gap}>
        <Shares format={(n) => String(n)} parts={g.loyalty} />
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <BarList format={money} barColor={color.chart.money.income.solid} rows={top.map((r) => ({ label: r.fullName, value: r.spend }))} />
        </View>
      </View>
    </Card>
  );
}

/** Quotations or invoices: where they stand, and the money in them. */
export function SalesGlance({ docs, money }: { docs: Parameters<typeof salesGlance>[0]; money: (n: number) => string }) {
  if (docs.length === 0) return null;
  const g = salesGlance(docs);
  return (
    <Card title="At a glance">
      <View style={styles.gap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <SplitBar format={(n) => String(n)} parts={g.byStatus} />
        <SplitBar format={money} parts={[{ label: "Paid", value: g.paid, color: color.chart.money.paid.solid }, { label: "Due", value: g.due, color: color.chart.money.left.solid }]} />
      </View>
    </Card>
  );
}

/** Each package's price, split into cost and margin. */
export function ToursGlance({ packages, money }: { packages: { name: string; totals: { cost: number; margin: number } }[]; money: (n: number) => string }) {
  if (packages.length === 0) return null;
  return (
    <Card title="Cost and margin">
      <Columns
        height={120}
        formatFull={money}
        series={[{ key: "cost", label: "Cost", color: color.chart.money.deduction.solid }, { key: "margin", label: "Margin", color: color.chart.money.paid.solid }]}
        data={packages.map((p) => ({ label: p.name.slice(0, 6), title: p.name, values: { cost: Math.max(0, p.totals.cost), margin: Math.max(0, p.totals.margin) } }))}
      />
    </Card>
  );
}

/** The wallet's balance after each movement, and what went in and out. */
export function WalletGlance({ txns, money }: { txns: Parameters<typeof walletGlance>[0]; money: (n: number) => string }) {
  if (txns.length === 0) return null;
  const g = walletGlance(txns);
  return (
    <Card title="The balance over time">
      <View style={styles.gap}>
        <Columns height={110} formatFull={money} series={[{ key: "balance", label: "Balance", color: color.chart.money.income.solid }]} data={g.balance.map((b) => ({ label: b.day.slice(8), title: b.day, values: { balance: Math.max(0, b.value) } }))} />
        <SplitBar format={money} parts={[{ label: "Came in", value: g.in, color: color.chart.money.paid.solid }, { label: "Went out", value: g.out, color: color.chart.money.late.solid }]} />
      </View>
    </Card>
  );
}

/** The team as faces, coloured by role. */
export function PeopleGlance({ people }: { people: { name: string; group: string; active: boolean }[] }) {
  if (people.length === 0) return null;
  const parts = sharesBy(people, (p) => p.group, (g) => g);
  const tint = new Map(parts.map((p) => [p.key, p.color]));
  return (
    <Card title="Who is on the team">
      <View style={styles.gap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.faces}>
          {people.map((p, i) => (
            <View key={i} style={[styles.face, { backgroundColor: tint.get(p.group), opacity: p.active ? 1 : 0.4 }]}>
              <Text step="strong" weight="bold" tone="onBrand">
                {p.name.trim().charAt(0).toUpperCase() || "?"}
              </Text>
            </View>
          ))}
        </View>
        <SplitBar format={(n) => String(n)} parts={parts} />
      </View>
    </Card>
  );
}

/** The plan's allowance — how much of it the account uses. */
export function PlanUsage({ usage }: { usage: { resorts: number; rooms: number; staffUsers: number; guests: number; limits: { maxResorts: number; maxRoomsPerResort: number } } }) {
  const roomCap = usage.limits.maxRoomsPerResort * Math.max(1, usage.resorts);
  return (
    <View style={styles.gap}>
      <SplitBar format={(n) => String(n)} total={usage.limits.maxResorts} parts={[{ label: `Resorts ${usage.resorts} of ${usage.limits.maxResorts}`, value: usage.resorts, color: color.chart.money.paid.solid }]} />
      {roomCap < 1000 ? (
        <SplitBar format={(n) => String(n)} total={roomCap} parts={[{ label: `Rooms ${usage.rooms} of ${roomCap}`, value: usage.rooms, color: color.chart.money.advance.solid }]} />
      ) : null}
      <View style={styles.figures}>
        {roomCap >= 1000 ? <Kpi label="Rooms" value={String(usage.rooms)} tint={color.chart.money.advance.solid} sub="no practical cap" /> : null}
        <Kpi label="Staff users" value={String(usage.staffUsers)} tint={color.chart.money.income.solid} />
        <Kpi label="Guests" value={String(usage.guests)} tint={color.chart.money.bonus.solid} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  gap: { gap: space.sm },
  board: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tile: { width: "31%", minHeight: 92, padding: space.sm, borderRadius: radius.md, gap: 2 },
  tileWords: { gap: 2 },
  pressed: { opacity: 0.7 },
  nights: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  night: { width: 44, alignItems: "center", paddingVertical: 4, borderRadius: radius.md },
  faces: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  face: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
