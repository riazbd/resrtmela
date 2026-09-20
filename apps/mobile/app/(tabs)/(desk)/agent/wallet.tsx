/**
 * The agency's wallet: the balance, and how it got there.
 *
 * There is no payment gateway behind this. An agency hands over cash or
 * sends bKash and somebody at the platform credits the balance — so
 * every line carries **who** moved it and **how**, and the reason those
 * columns exist at all is that an agency could once watch its balance
 * rise and not know who had done it.
 *
 * Both are null on rows written before they were recorded, and a screen
 * that prints "by null" is worse than one that says nothing. Absent is
 * absent here, as it is everywhere else in this app.
 *
 * `amount` is signed: positive is money in. The sign is drawn explicitly
 * rather than left to the number, because "৳8,000" in a list of
 * movements does not say which direction it went.
 */
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { useApi } from "@rh/app-core";
import { dayLabel, formatMoney, type AgencyWallet, type AgencyWalletTxn } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { useMoneyFormat } from "../../../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../../../src/design/states";
import { Card, Row, Stat } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { color, radius, space } from "../../../../src/design/tokens";

/** What each kind of movement is, in words somebody outside would use. */
const KIND_WORDS: Record<string, string> = {
  TOPUP: "Top-up",
  COMMISSION: "Commission",
  BOOKING_HOLD: "Held for a booking",
  PAYOUT: "Paid out",
  REFUND: "Refund",
  ADJUST: "Adjustment",
};

export default function AgentWalletScreen() {
  const { me } = useAuth();
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });

  const wallet = useApi<AgencyWallet>(["agent-wallet"], () => client.agent.wallet(), {
    enabled: Boolean(me),
  });

  const header = <Stack.Screen options={{ title: "Wallet" }} />;

  if (wallet.error && !wallet.data) {
    return (
      <>
        {header}
        <Problem error={wallet.error} onRetry={() => void wallet.refetch()} />
      </>
    );
  }

  if (!wallet.data) {
    return (
      <>
        {header}
        <Loading what="the wallet" />
      </>
    );
  }

  const w = wallet.data;

  return (
    <>
      {header}
      <Stale age={wallet.stale} />
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl refreshing={wallet.isRefetching} onRefresh={() => void wallet.refetch()} />
        }
      >
        <View style={styles.figures}>
          <Stat
            label="Balance"
            value={whole(w.balance)}
            sub={w.active ? "available to book with" : "the wallet is switched off"}
            tone={w.balance > 0 ? "ok" : "danger"}
          />
        </View>

        {w.active ? null : (
          <View style={styles.off}>
            <Text step="small" weight="medium" tone="warn">
              This wallet is switched off — bookings will not draw from it.
            </Text>
          </View>
        )}

        <Card title="What moved">
          {w.txns.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty
                message="Nothing has moved yet"
                hint="Top-ups and the holds against your bookings appear here."
              />
            </View>
          ) : (
            w.txns.map((t, i) => (
              <Line key={t.id} txn={t} last={i === w.txns.length - 1} whole={whole} />
            ))
          )}
        </Card>

        <Text step="caption" tone="muted" style={styles.footnote}>
          Topping up is not automatic — hand the money over and somebody at
          the platform credits it here.
        </Text>
      </ScrollView>
    </>
  );
}

function Line({
  txn,
  last,
  whole,
}: {
  txn: AgencyWalletTxn;
  last: boolean;
  whole: (n: number) => string;
}) {
  const inward = txn.amount >= 0;
  const what = KIND_WORDS[txn.kind] ?? txn.kind;
  /**
   * Who and how, only where the row knows. A line written before those
   * columns existed says nothing about them rather than "by null".
   */
  const provenance = [txn.by ? `by ${txn.by}` : null, txn.method ? methodWord(txn.method) : null]
    .filter(Boolean)
    .join(" · ");
  const under = [txn.note, provenance].filter(Boolean).join(" · ");

  return (
    <Row
      title={what}
      subtitle={under || undefined}
      meta={`${dayLabel(txn.createdAt, { style: "full" })}${
        txn.bookingId ? ` · booking #${txn.bookingId}` : ""
      }`}
      last={last}
      accessibilityLabel={`${what}, ${inward ? "in" : "out"} ${whole(Math.abs(txn.amount))}${
        under ? `, ${under}` : ""
      }, leaving ${whole(txn.balanceAfter)}`}
      right={
        <View style={styles.right}>
          <Text
            step="body"
            weight="medium"
            tone={inward ? "ok" : "danger"}
            tabular
          >
            {/* the sign is drawn, not implied: a figure in a list of
                movements has to say which way it went */}
            {inward ? "+" : "−"}
            {whole(Math.abs(txn.amount))}
          </Text>
          <Text step="caption" tone="muted" tabular>
            {whole(txn.balanceAfter)}
          </Text>
        </View>
      }
    />
  );
}

/** "CASH" → "Cash", "BKASH" → "bKash" — how people write them. */
function methodWord(method: string): string {
  const known: Record<string, string> = { CASH: "Cash", BKASH: "bKash", NAGAD: "Nagad", BANK: "Bank" };
  return known[method.toUpperCase()] ?? method.charAt(0) + method.slice(1).toLowerCase();
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  right: { alignItems: "flex-end", gap: 2 },
  emptyBox: { paddingVertical: space.lg },
  footnote: { textAlign: "center" },
  off: {
    backgroundColor: color.warn.bg,
    borderWidth: 1,
    borderColor: color.warn.line,
    borderRadius: radius.md,
    padding: space.md,
  },
});
