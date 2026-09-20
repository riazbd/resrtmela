/**
 * A restaurant ticket, written standing up.
 *
 * Who it is for comes **first**, because it decides everything below it.
 * A ticket charged to a booking is owed by the stay and lands on its
 * invoice; a ticket with a guest name and no booking is cash at the
 * counter and has to be collected now. Choosing that at the end — which
 * is where a form usually puts it — is how a bill ends up on the wrong
 * side of a stay.
 *
 * The packages are the resort's menu, and tapping one adds a line rather
 * than replacing the ticket: a table orders two teas and a set lunch.
 * The total is not shown before the bill exists, because the tax rules
 * that decide it never reach a client and a guess read out loud at a
 * table is worse than no figure.
 */
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import { keys, useApi, useQueryClient } from "@rh/app-core";
import {
  formatMoney,
  todayIn,
  type FbInHouse,
  type FoodPackage,
  type NewFbBillItem,
  type ResortOption,
} from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { WhichResort } from "../../../../src/screens/which-resort";
import { Button } from "../../../../src/design/button";
import { Chip } from "../../../../src/design/chip";
import { Counter } from "../../../../src/design/counter";
import { Field, Input } from "../../../../src/design/input";
import { useMoneyFormat } from "../../../../src/design/money";
import { Empty, Loading, Problem } from "../../../../src/design/states";
import { Card, Row } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { useAction } from "../../../../src/design/use-action";
import { color, radius, space } from "../../../../src/design/tokens";

interface Line extends NewFbBillItem {
  /** Stable across re-orders, which an index is not. */
  key: string;
}

export default function NewTicketScreen() {
  const { activeResort } = useAuth();
  const resortId = activeResort?.id;
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });
  const qc = useQueryClient();

  const [onRoom, setOnRoom] = useState<FbInHouse | null>(null);
  const [counterName, setCounterName] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [paid, setPaid] = useState(0);
  const [method, setMethod] = useState("CASH");
  const [tried, setTried] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const inHouse = useApi<FbInHouse[]>(
    keys.fbInHouse(resortId),
    () => client.fb.inHouse(resortId!),
    { enabled: resortId !== undefined },
  );
  const packages = useApi<FoodPackage[]>(
    keys.fbPackages(resortId),
    () => client.fb.packages(resortId!),
    { enabled: resortId !== undefined, staleTime: 3_600_000 },
  );
  const methods = useApi<ResortOption[]>(
    keys.options(resortId, "PAYMENT_METHOD"),
    () => client.options.list(resortId!, "PAYMENT_METHOD"),
    { enabled: resortId !== undefined, staleTime: 3_600_000 },
  );

  const nobody = !onRoom && !counterName.trim();
  const nothing = lines.length === 0;
  const incomplete = nobody || nothing;

  function addLine(name: string, unitPrice: number) {
    setLines((now) => [
      ...now,
      { key: `${Date.now()}-${now.length}`, name, qty: 1, unitPrice },
    ]);
    setTried(false);
  }

  const write = useAction(async () => {
    if (incomplete) {
      setTried(true);
      return;
    }
    setRefused(null);
    try {
      const bill = await client.fb.createBill(resortId!, {
        date: todayIn(activeResort?.timezone),
        items: lines.map(({ name, qty, unitPrice }) => ({ name, qty, unitPrice })),
        bookingId: onRoom?.bookingId,
        // the two are exclusive: a booking's bill is owed by the stay
        guestName: onRoom ? undefined : counterName.trim(),
        paidAmount: paid > 0 ? paid : undefined,
        method: paid > 0 ? method : undefined,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["fb-bills"] }),
        // a bill on a room changes what the stay owes, everywhere
        qc.invalidateQueries({ queryKey: ["booking"] }),
        qc.invalidateQueries({ queryKey: ["day-sheet"] }),
        qc.invalidateQueries({ queryKey: ["dues"] }),
      ]);
      void bill;
      router.back();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  const header = <Stack.Screen options={{ title: "New ticket" }} />;

  if (resortId === undefined) {
    return (
      <>
        {header}
        <WhichResort what="who is in house" />
      </>
    );
  }

  return (
    <>
      {header}
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {/* first, because it decides which side of the stay this lands on */}
        <Card title="Who is it for">
          <View style={styles.fields}>
            {inHouse.error && !inHouse.data ? (
              <Problem error={inHouse.error} onRetry={() => void inHouse.refetch()} />
            ) : !inHouse.data ? (
              <Loading what="who is in house" />
            ) : inHouse.data.length === 0 ? (
              <Text step="small" tone="muted">
                Nobody is in house, so this is a counter sale.
              </Text>
            ) : (
              <View style={styles.kinds}>
                {inHouse.data.map((stay) => (
                  <Chip
                    key={stay.bookingId}
                    label={`${stay.rooms.filter(Boolean).join(", ") || stay.code} · ${stay.guestName}`}
                    on={onRoom?.bookingId === stay.bookingId}
                    onPress={() => {
                      setOnRoom(onRoom?.bookingId === stay.bookingId ? null : stay);
                      setCounterName("");
                      setTried(false);
                    }}
                  />
                ))}
              </View>
            )}

            {onRoom ? (
              <View style={styles.onRoom}>
                <Text step="small" tone="ok" weight="medium">
                  Charged to {onRoom.code} — it goes on the stay&apos;s invoice.
                </Text>
              </View>
            ) : (
              <Field
                label="Or a name, for the counter"
                error={tried && nobody ? "Say whose ticket this is." : null}
              >
                <Input
                  value={counterName}
                  onChangeText={(text) => {
                    setCounterName(text);
                    if (text.trim()) setTried(false);
                  }}
                  placeholder="Walk-in"
                  autoCapitalize="words"
                  invalid={tried && nobody}
                />
              </Field>
            )}
          </View>
        </Card>

        <Card title="The ticket">
          {lines.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty message="Nothing on it yet" hint="Tap something from the menu below." />
            </View>
          ) : (
            lines.map((line, i) => (
              <Row
                key={line.key}
                title={line.name}
                subtitle={`${whole(line.unitPrice)} each`}
                last={i === lines.length - 1}
                accessibilityLabel={`${line.name}, ${line.qty} at ${whole(line.unitPrice)}`}
                right={
                  <View style={styles.lineEnd}>
                    <Counter
                      label={line.name}
                      min={1}
                      value={line.qty}
                      onChange={(qty) =>
                        setLines((now) => now.map((l) => (l.key === line.key ? { ...l, qty } : l)))
                      }
                    />
                    <Button
                      label="×"
                      kind="ghost"
                      block={false}
                      accessibilityLabel={`Remove ${line.name}`}
                      onPress={() => setLines((now) => now.filter((l) => l.key !== line.key))}
                    />
                  </View>
                }
              />
            ))
          )}
          {tried && nothing ? (
            <Text step="small" tone="danger" weight="medium">
              Put something on the ticket.
            </Text>
          ) : null}
        </Card>

        <Card title="The menu">
          {packages.error && !packages.data ? (
            <Problem error={packages.error} onRetry={() => void packages.refetch()} />
          ) : !packages.data ? (
            <Loading what="the menu" />
          ) : packages.data.filter((p) => p.active).length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty
                message="No food packages yet"
                hint="They are set up on the desk; until then, add a line by hand below."
              />
            </View>
          ) : (
            <View style={styles.kinds}>
              {packages.data
                .filter((p) => p.active)
                .map((p) => (
                  <Chip
                    key={p.id}
                    label={`${p.name} · ${whole(Number(p.price))}`}
                    on={false}
                    onPress={() => addLine(p.name, Number(p.price))}
                  />
                ))}
            </View>
          )}
          <ByHand onAdd={addLine} />
        </Card>

        <Card title="Taking money now">
          <View style={styles.fields}>
            <Field
              label="Amount"
              hint={onRoom ? "Leave it empty to put the whole bill on the room" : undefined}
            >
              <Input
                value={paid ? String(paid) : ""}
                onChangeText={(text) => setPaid(Number(text.replace(/[^0-9.]/g, "")) || 0)}
                placeholder="0"
                keyboardType="numeric"
              />
            </Field>
            {paid > 0 ? (
              <View style={styles.kinds}>
                {(methods.data ?? [])
                  .filter((m) => m.active)
                  .map((m) => (
                    <Chip
                      key={m.code}
                      label={m.label}
                      on={method === m.code}
                      onPress={() => setMethod(m.code)}
                    />
                  ))}
              </View>
            ) : null}
          </View>
        </Card>

        {refused ? (
          <View style={styles.refused}>
            <Text step="small" tone="danger" weight="medium">
              {refused}
            </Text>
          </View>
        ) : null}

        {/* no total here: the resort's tax rules decide it and never reach a
            client, so a figure read out at a table would be a guess */}
        <Button label="Write the bill" loading={write.busy} onPress={write.go} />
        <Button label="Cancel" kind="ghost" onPress={() => router.back()} />
      </ScrollView>
    </>
  );
}

/** A line that is not on the menu — which most of a bar order is. */
function ByHand({ onAdd }: { onAdd: (name: string, price: number) => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState(0);

  return (
    <View style={styles.byHand}>
      <Field label="Something else">
        <Input value={name} onChangeText={setName} placeholder="Mineral water" />
      </Field>
      <Field label="Price each">
        <Input
          value={price ? String(price) : ""}
          onChangeText={(text) => setPrice(Number(text.replace(/[^0-9.]/g, "")) || 0)}
          placeholder="0"
          keyboardType="numeric"
        />
      </Field>
      <Button
        label="Add the line"
        kind="ghost"
        onPress={() => {
          if (!name.trim() || !(price > 0)) return;
          onAdd(name.trim(), price);
          setName("");
          setPrice(0);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  fields: { gap: space.md },
  kinds: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  lineEnd: { flexDirection: "row", alignItems: "center", gap: space.xs },
  byHand: { gap: space.md, paddingTop: space.md },
  emptyBox: { paddingVertical: space.lg },
  onRoom: {
    backgroundColor: color.ok.bg,
    borderWidth: 1,
    borderColor: color.ok.line,
    borderRadius: radius.md,
    padding: space.md,
  },
  refused: {
    backgroundColor: color.danger.bg,
    borderWidth: 1,
    borderColor: color.danger.line,
    borderRadius: radius.md,
    padding: space.md,
  },
});
