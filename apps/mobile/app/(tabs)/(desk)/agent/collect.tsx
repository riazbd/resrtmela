/**
 * "I took money from the guest."
 *
 * The door that stops the front desk asking a guest who has already paid.
 * Guest money handed to an agent used to be outside the system entirely: the
 * agent held it, the booking still read unpaid, and the guest was asked again
 * at checkout for money they had handed over in Dhaka a week earlier.
 *
 * It writes an ordinary payment on the booking, marked as collected by the
 * agent rather than counted at the desk. Two facts, not one: the guest's bill
 * goes down *and* the agency's account shows what they are holding of the
 * resort's. The same row answers both, which is why it is one column on
 * `payments` and not a second ledger.
 *
 * On a phone because that is where an agent is when a guest hands them cash.
 */
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import { formatMoney, todayIn, type AgentStatement, type BookingDetail } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { Button } from "../../../../src/design/button";
import { Chip } from "../../../../src/design/chip";
import { Field, Input } from "../../../../src/design/input";
import { useMoneyFormat } from "../../../../src/design/money";
import { Empty, Loading, Problem } from "../../../../src/design/states";
import { Stat } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { useAction } from "../../../../src/design/use-action";
import { color, space } from "../../../../src/design/tokens";

export default function CollectScreen() {
  const { booking: bookingParam } = useLocalSearchParams<{ booking?: string }>();
  const bookingId = Number(bookingParam);
  const router = useRouter();
  const { can } = useAuth();
  const money = useMoneyFormat();
  const whole = (amount: number) => formatMoney(amount, { ...money, decimals: 0 });

  const header = <Stack.Screen options={{ title: "Money from the guest" }} />;

  const stay = useApi<BookingDetail>(
    keys.booking(bookingId),
    () => client.bookings.get(bookingId),
    { enabled: Number.isFinite(bookingId) && bookingId > 0 && can("agent.collect") },
  );

  /**
   * The resort's own list of how it takes money, which an agent cannot read
   * from the options endpoint — that one is behind `settings.manage`, and
   * rightly so. The statement carries it, already scoped to this agency.
   */
  const statement = useApi<AgentStatement>(
    keys.myStatement(stay.data?.resortId),
    () => client.agent.accounts.statement(stay.data!.resortId),
    { enabled: Boolean(stay.data?.resortId) },
  );

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [refused, setRefused] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const save = useAction(async () => {
    setRefused(null);
    const value = Number(amount);
    if (!(value > 0)) {
      setRefused("Put in how much the guest gave you.");
      return;
    }
    if (!method) {
      setRefused("Say how the guest paid you.");
      return;
    }
    try {
      const out = await client.agent.accounts.collect(bookingId, {
        amount: value,
        method,
        // the resort's today, not the phone's: Dhaka is UTC+6, so for six hours
        // after midnight the phone's own date files the money on the day before
        date: todayIn(statement.data?.resort.timezone),
        note: note.trim() || undefined,
      });
      setDone(out.balance);
      void stay.refetch();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That did not go through.");
    }
  });

  if (!can("agent.collect")) {
    return (
      <>
        {header}
        <View style={styles.middle}>
          <Empty
            message="Not open to you"
            hint="Ask the agency owner if you should be taking money from guests."
          />
        </View>
      </>
    );
  }
  if (stay.error && !stay.data) {
    return (
      <>
        {header}
        <Problem error={stay.error} onRetry={() => void stay.refetch()} />
      </>
    );
  }
  if (!stay.data) {
    return (
      <>
        {header}
        <Loading what="the booking" />
      </>
    );
  }

  const b = stay.data;

  if (done != null) {
    return (
      <>
        {header}
        <ScrollView contentContainerStyle={styles.page}>
          <Stat
            label="Written down"
            value={whole(Number(amount))}
            tone="ok"
            sub={`${b.code} now has ${whole(b.due)} due`}
          />
          <Text step="small" tone="muted">
            The resort can see it straight away, and your account with them now stands at{" "}
            {whole(Math.abs(done))}.
          </Text>
          <Button label="Back to the booking" onPress={() => router.back()} />
        </ScrollView>
      </>
    );
  }

  return (
    <>
      {header}
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Stat label={`${b.code} · ${b.guest.fullName}`} value={whole(b.due)} sub="Still due on this stay" />

        <Field label="How much the guest gave you">
          <Input
            value={amount}
            onChangeText={setAmount}
            keyboardType="number-pad"
            placeholder="0"
            accessibilityLabel="How much the guest gave you"
          />
        </Field>

        <Field label="How they paid you">
          {statement.data ? (
            <View style={styles.chips}>
              {statement.data.methods.map((m) => (
                <Chip key={m.code} label={m.label} on={method === m.code} onPress={() => setMethod(m.code)} />
              ))}
            </View>
          ) : (
            <Text step="small" tone="muted">
              Loading how this resort takes money…
            </Text>
          )}
        </Field>

        <Field label="Note" hint="Optional">
          <Input
            value={note}
            onChangeText={setNote}
            placeholder="Anything worth remembering"
            accessibilityLabel="Note"
          />
        </Field>

        <Text step="small" tone="muted">
          This is the guest&rsquo;s money in your hand. The resort will see the bill go down and the
          amount you are holding go up.
        </Text>

        {refused ? (
          <Text step="small" tone="danger" weight="medium">
            {refused}
          </Text>
        ) : null}

        <Button label="Write it down" loading={save.busy} onPress={save.go} />
        <Button label="Not now" kind="ghost" onPress={() => router.back()} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.md, backgroundColor: color.screen },
  middle: { flex: 1, justifyContent: "center", padding: space.lg },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
