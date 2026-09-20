/**
 * The restaurant: today's bills, and putting one on a room.
 *
 * The console has a POS with a ticket builder, a package menu and a
 * bills table. The phone keeps the part that is actually done standing
 * up — writing a ticket and charging it — and reads the day's bills
 * back.
 *
 * The one decision worth stating: a bill charged to a **booking** is
 * owed by the stay and appears on its invoice, and a bill with a guest
 * name and no booking is cash at the counter. That is the whole
 * difference between the two paths through this screen, and getting it
 * wrong means either a guest paying twice or a stay leaving unpaid.
 *
 * Every figure is the server's. `fbBillTotals` is one arithmetic in one
 * place precisely because it used to be written out by hand in nine
 * files with inconsistent rounding and no tax — so a resort charging
 * VAT charged it on the room and not on the food.
 */
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import { keys, useApi, useQueryClient } from "@rh/app-core";
import {
  addDaysIso,
  dayLabel,
  formatMoney,
  todayIn,
  type FbBill,
  type FbInHouse,
} from "@rh/shared";
import { client, useAuth } from "../../src/api/session";
import { WhichResort } from "../../src/screens/which-resort";
import { Button } from "../../src/design/button";
import { DateNav } from "../../src/design/date-nav";
import { useMoneyFormat } from "../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../src/design/states";
import { Card, Row, Stat } from "../../src/design/surface";
import { Text } from "../../src/design/text";
import { color, radius, space } from "../../src/design/tokens";

export default function RestaurantScreen() {
  const { activeResort, can } = useAuth();
  const resortId = activeResort?.id;
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });

  /** `null` is the resort's today, resolved on read — the day sheet's lesson. */
  const [chosen, setDate] = useState<string | null>(null);
  const date = chosen ?? todayIn(activeResort?.timezone);

  const bills = useApi(
    keys.fbBills(resortId, date),
    () => client.fb.bills(resortId!, { from: date, to: addDaysIso(date, 1) }),
    { enabled: resortId !== undefined, placeholderData: (prev: unknown) => prev as never },
  );

  const header = <Stack.Screen options={{ title: "Restaurant" }} />;

  if (resortId === undefined) {
    return (
      <>
        {header}
        <WhichResort what="the day's bills" />
      </>
    );
  }

  if (bills.error && !bills.data) {
    return (
      <>
        {header}
        <Problem error={bills.error} onRetry={() => void bills.refetch()} />
      </>
    );
  }

  if (!bills.data) {
    return (
      <>
        {header}
        <Loading what="the day's bills" />
      </>
    );
  }

  const rows: FbBill[] = bills.data.rows ?? [];
  // summed from the page, and the label says so: this route sends no
  // total of the day's takings the way the expenses one does
  const billed = rows.reduce((sum, b) => sum + b.total, 0);
  const owed = rows.reduce((sum, b) => sum + b.due, 0);

  return (
    <>
      {header}
      <Stale age={bills.stale} />
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl refreshing={bills.isRefetching} onRefresh={() => void bills.refetch()} />
        }
      >
        <DateNav value={date} onChange={setDate} timezone={activeResort?.timezone} />

        <View style={styles.figures}>
          <Stat label="Billed" value={whole(billed)} sub="on this page" />
          <Stat label="Unpaid" value={whole(owed)} tone={owed > 0 ? "danger" : "title"} />
          <Stat label="Bills" value={String(bills.data.total ?? rows.length)} />
        </View>

        {can("restaurant.create") ? (
          <Button label="New ticket" onPress={() => router.push("/fb/new" as never)} />
        ) : null}

        <Card title="The day">
          {rows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty
                message="Nothing sold on this day"
                hint={can("restaurant.create") ? "Write a ticket and it appears here." : undefined}
              />
            </View>
          ) : (
            rows.map((bill, i) => <BillRow key={bill.id} bill={bill} whole={whole} last={i === rows.length - 1} />)
          )}
        </Card>
      </ScrollView>
    </>
  );
}

function BillRow({
  bill,
  whole,
  last,
}: {
  bill: FbBill;
  whole: (n: number) => string;
  last: boolean;
}) {
  /**
   * Who owes it, which is the only thing that distinguishes two bills
   * of the same amount: a booking's bill goes on the stay's invoice, a
   * named one was paid at the counter.
   */
  const whose = bill.bookingId ? "On the room" : (bill.guestName ?? "Counter");

  return (
    <Row
      title={bill.code}
      subtitle={`${whose} · ${bill.items.length} item${bill.items.length === 1 ? "" : "s"}`}
      meta={bill.method ?? undefined}
      last={last}
      accessibilityLabel={`${bill.code}, ${whose}, ${whole(bill.total)}${bill.due > 0 ? `, ${whole(bill.due)} unpaid` : ", paid"}`}
      right={
        <View style={styles.right}>
          <Text step="body" weight="medium" tone="title" tabular>
            {whole(bill.total)}
          </Text>
          {bill.due > 0 ? (
            <View style={styles.unpaid}>
              <Text step="caption" weight="medium" tone="danger">
                {whole(bill.due)} due
              </Text>
            </View>
          ) : null}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  right: { alignItems: "flex-end", gap: space.xs },
  emptyBox: { paddingVertical: space.lg },
  unpaid: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
});
