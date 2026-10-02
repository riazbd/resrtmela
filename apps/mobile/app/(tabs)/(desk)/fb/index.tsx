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
  type FoodPackage,
  type ResortOption,
} from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { WhichResort } from "../../../../src/screens/which-resort";
import { Button } from "../../../../src/design/button";
import { DateNav } from "../../../../src/design/date-nav";
import { useMoneyFormat } from "../../../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../../../src/design/states";
import { Card, Row, Stat } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { color, elevation, radius, space } from "../../../../src/design/tokens";
import { BarList, SplitBar } from "../../../../src/design/charts";
import { Chip } from "../../../../src/design/chip";
import { Field, Input } from "../../../../src/design/input";
import { ask, refusal } from "../../../../src/screens/payroll-month";

export default function RestaurantScreen() {
  const { activeResort, can, isManagement } = useAuth();
  const qc = useQueryClient();
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

  const packages = useApi<FoodPackage[]>(keys.fbPackages(resortId), () => client.fb.packages(resortId!), {
    enabled: resortId !== undefined,
    staleTime: 3_600_000,
  });
  const methods = useApi<ResortOption[]>(
    keys.options(resortId, "PAYMENT_METHOD"),
    () => client.options.list(resortId!, "PAYMENT_METHOD"),
    { enabled: resortId !== undefined, staleTime: 3_600_000 },
  );
  const [collecting, setCollecting] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [pkg, setPkg] = useState({ name: "", price: "", items: "" });
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setSaid(null);
    try {
      await fn();
      setSaid({ ok: true, text: ok });
      await qc.invalidateQueries({ queryKey: ["fb-bills", resortId] });
      await qc.invalidateQueries({ queryKey: ["fb-packages", resortId] });
      return true;
    } catch (e) {
      setSaid({ ok: false, text: refusal(e) });
      return false;
    }
  }

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
  const paidUp = Math.max(0, billed - owed);
  /** what sold, by name, across the day's bills — the menu's best sellers */
  const sold = [...rows.flatMap((b) => b.items).reduce((m, it) => m.set(it.name, (m.get(it.name) ?? 0) + it.qty * it.unitPrice), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]);
  const payWith = (methods.data ?? []).filter((m) => m.active);

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

        {said ? (
          <Text step="small" weight="medium" tone={said.ok ? "ok" : "danger"}>
            {said.text}
          </Text>
        ) : null}

        {billed > 0 ? (
          <Card title="The day in pictures">
            <View style={styles.gap}>
              <SplitBar
                format={whole}
                parts={[
                  { label: "Paid", value: paidUp, color: color.chart.money.paid.solid },
                  { label: "Still due", value: owed, color: color.chart.money.left.solid },
                ]}
              />
              {sold.length > 0 ? (
                <>
                  <Text step="small" weight="medium" tone="title">
                    What sold
                  </Text>
                  <BarList format={whole} limit={6} barColor={color.chart.money.advance.solid} rows={sold.map(([label, value]) => ({ label, value }))} />
                </>
              ) : null}
            </View>
          </Card>
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
            rows.map((bill, i) => (
              <View key={bill.id}>
                <BillRow bill={bill} whole={whole} last={i === rows.length - 1 && collecting !== bill.id} />
                {isManagement && bill.due > 0 ? (
                  collecting === bill.id ? (
                    <View style={styles.collect}>
                      <Field label="Amount">
                        <Input value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder={String(bill.due)} />
                      </Field>
                      <View style={styles.chips}>
                        {(payWith.length ? payWith : [{ code: "CASH", label: "Cash" }]).map((m) => (
                          <Chip key={m.code} label={m.label} on={method === m.code} onPress={() => setMethod(m.code)} />
                        ))}
                      </View>
                      <Button
                        label={`Collect ${whole(Number(amount) || bill.due)}`}
                        onPress={async () => {
                          const value = Number(amount) || bill.due;
                          if (await act(() => client.fb.payBill(bill.id, { amount: value, method }), `${whole(value)} collected on ${bill.code}`)) {
                            setCollecting(null);
                            setAmount("");
                          }
                        }}
                      />
                      <Button label="Not now" kind="ghost" onPress={() => setCollecting(null)} />
                    </View>
                  ) : (
                    <Button label={`Collect on ${bill.code}`} kind="ghost" onPress={() => { setCollecting(bill.id); setAmount(String(bill.due)); }} />
                  )
                ) : null}
              </View>
            ))
          )}
        </Card>

        <Card title="The menu">
          <View style={styles.gap}>
            {(packages.data ?? []).length === 0 ? (
              <Empty message="Nothing on the menu yet" hint={isManagement ? "Add a dish or a combo below." : undefined} />
            ) : (
              <View style={styles.menu}>
                {(packages.data ?? []).map((p, i) => (
                  <View key={p.id} style={styles.dish} accessible accessibilityLabel={`${p.name}, ${whole(Number(p.price))}${p.items ? `, ${p.items}` : ""}`}>
                    <View style={[styles.dishBand, { backgroundColor: color.chart.series[i % color.chart.series.length] }]} />
                    <Text step="body" weight="bold" tone="title" numberOfLines={2}>
                      {p.name}
                    </Text>
                    {p.items ? (
                      <Text step="caption" tone="muted" numberOfLines={2}>
                        {p.items}
                      </Text>
                    ) : null}
                    <View style={styles.dishFoot}>
                      <Text step="strong" weight="bold" tone="ok" tabular>
                        {whole(Number(p.price))}
                      </Text>
                      {isManagement ? (
                        <Button
                          label="×"
                          kind="subtle"
                          block={false}
                          accessibilityLabel={`Take ${p.name} off the menu`}
                          onPress={() => ask(`Take ${p.name} off the menu?`, "Bills that already have it keep it.", "Take off", () => void act(() => client.fb.removePackage(p.id), `${p.name} is off the menu`))}
                        />
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            )}
            {isManagement ? (
              <>
                <Field label="A dish or a combo">
                  <Input value={pkg.name} onChangeText={(t) => setPkg({ ...pkg, name: t })} placeholder="BBQ dinner for two" />
                </Field>
                <Field label="Price">
                  <Input value={pkg.price} onChangeText={(t) => setPkg({ ...pkg, price: t })} keyboardType="numeric" />
                </Field>
                <Field label="What comes with it" hint="Optional">
                  <Input value={pkg.items} onChangeText={(t) => setPkg({ ...pkg, items: t })} placeholder="rice, chicken, salad, borhani" />
                </Field>
                <Button
                  label="Put it on the menu"
                  kind="ghost"
                  disabled={!pkg.name.trim() || !(Number(pkg.price) >= 0) || pkg.price === ""}
                  onPress={async () => {
                    if (await act(() => client.fb.createPackage(resortId, { name: pkg.name.trim(), price: Number(pkg.price), items: pkg.items.trim() || undefined }), `${pkg.name.trim()} is on the menu`)) {
                      setPkg({ name: "", price: "", items: "" });
                    }
                  }}
                />
              </>
            ) : null}
          </View>
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
  gap: { gap: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  collect: { gap: space.sm, paddingVertical: space.md },
  menu: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  dish: {
    flexGrow: 1,
    flexBasis: "45%",
    backgroundColor: color.surface,
    borderRadius: radius.md,
    padding: space.md,
    paddingTop: space.lg,
    gap: 2,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: color.ink[100],
    ...elevation.raised,
  },
  dishBand: { position: "absolute", top: 0, left: 0, right: 0, height: 6 },
  dishFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.xs },
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
