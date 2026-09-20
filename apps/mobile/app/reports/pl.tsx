/**
 * Profit and loss: the resort, the restaurant, and the two together.
 *
 * The one report where every line has to be labelled carefully, because
 * four of the figures look like income and are not: `billed` is what the
 * period's stays are worth rather than what came in, `stillDue` is what
 * has not come in at all, `taxCollected` is the government's, and
 * `discounts` is money that was never charged.
 *
 * The server does the arithmetic. This screen adds nothing up — the
 * resort's tax rules decide what is net of what, and they never reach a
 * client, so a total worked out here would be confidently wrong.
 */
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import { addDaysIso, formatMoney, stayRange, todayIn, type PLReport } from "@rh/shared";
import { client, useAuth } from "../../src/api/session";
import { useMoneyFormat } from "../../src/design/money";
import { Empty, Loading, Problem } from "../../src/design/states";
import { Card, Row, Stat } from "../../src/design/surface";
import { Text } from "../../src/design/text";
import { color, space } from "../../src/design/tokens";

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default function ProfitAndLossScreen() {
  const { activeResort } = useAuth();
  const resortId = activeResort?.id;
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });

  /** The period is chosen on the reports screen and travels in the URL. */
  const params = useLocalSearchParams<{ from?: string; to?: string }>();
  const today = todayIn(activeResort?.timezone);
  const from = isDay(params.from) ? params.from : addDaysIso(today, -90);
  const to = isDay(params.to) ? params.to : addDaysIso(today, 1);

  const report = useApi<PLReport>(
    keys.reports(resortId, "pl", { from, to }),
    () => client.reports.pl(resortId!, from, to),
    { enabled: resortId !== undefined },
  );

  const header = <Stack.Screen options={{ title: "Profit & loss" }} />;

  if (resortId === undefined) {
    return (
      <>
        {header}
        <Empty message="No resort selected" hint="Choose a resort from the More tab." />
      </>
    );
  }

  if (report.error && !report.data) {
    return (
      <>
        {header}
        <Problem error={report.error} onRetry={() => void report.refetch()} />
      </>
    );
  }

  if (!report.data) {
    return (
      <>
        {header}
        <Loading what="the profit and loss" />
      </>
    );
  }

  const { resort, restaurant, combined } = report.data;

  return (
    <>
      {header}
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl refreshing={report.isRefetching} onRefresh={() => void report.refetch()} />
        }
      >
        <Text step="small" tone="muted" style={styles.period}>
          {/* `to` is exclusive; the last day a person reads is the one before */}
          {stayRange(from, addDaysIso(to, -1))}
        </Text>

        <View style={styles.figures}>
          <Stat label="Income" value={whole(combined.income)} tone="ok" sub="received" />
          <Stat label="Expenses" value={whole(combined.expenses)} tone={combined.expenses > 0 ? "danger" : "title"} />
          <Stat
            label="Net"
            value={whole(combined.net)}
            tone={combined.net < 0 ? "danger" : "ok"}
          />
        </View>

        <Card title="The resort">
          <Row title="Room rent" meta={whole(resort.roomRevenue)} accessibilityLabel={`Room rent: ${whole(resort.roomRevenue)}`} />
          <Row title="Extra persons" meta={whole(resort.extraPersonRevenue)} accessibilityLabel={`Extra persons: ${whole(resort.extraPersonRevenue)}`} />
          <Row title="Services, damage & fines" meta={whole(resort.chargesRevenue)} accessibilityLabel={`Services, damage and fines: ${whole(resort.chargesRevenue)}`} />
          <Row title="Other" meta={whole(resort.otherRevenue)} accessibilityLabel={`Other revenue: ${whole(resort.otherRevenue)}`} />
          <Row
            title="Discounts"
            subtitle="Never charged, so never income"
            meta={resort.discounts > 0 ? `−${whole(resort.discounts)}` : whole(0)}
            accessibilityLabel={`Discounts, never charged: ${whole(resort.discounts)}`}
          />
          <Row
            title="Billed"
            subtitle="What these stays are worth — not what came in"
            meta={whole(resort.billed)}
            accessibilityLabel={`Billed, what the stays are worth rather than what came in: ${whole(resort.billed)}`}
          />
          <Row title="Expenses" meta={whole(resort.expenses)} accessibilityLabel={`Resort expenses: ${whole(resort.expenses)}`} />
          <Row title="Payroll" meta={whole(resort.payroll)} accessibilityLabel={`Payroll: ${whole(resort.payroll)}`} />
          <Row
            title="Income received"
            meta={whole(resort.income)}
            accessibilityLabel={`Income received: ${whole(resort.income)}`}
          />
          <Row
            title="Net"
            meta={whole(resort.net)}
            last
            accessibilityLabel={`Resort net: ${whole(resort.net)}`}
          />
        </Card>

        <Card title="The restaurant">
          <Row title="Sales" meta={whole(restaurant.revenue)} accessibilityLabel={`Restaurant sales: ${whole(restaurant.revenue)}`} />
          <Row title="Income received" meta={whole(restaurant.income)} accessibilityLabel={`Restaurant income received: ${whole(restaurant.income)}`} />
          <Row title="Expenses" meta={whole(restaurant.expenses)} accessibilityLabel={`Restaurant expenses: ${whole(restaurant.expenses)}`} />
          <Row title="Net" meta={whole(restaurant.net)} last accessibilityLabel={`Restaurant net: ${whole(restaurant.net)}`} />
        </Card>

        {/* the same warning the summary carries, because this is the screen
            somebody prints and reads out at a meeting */}
        <Card title="Not yours to spend">
          <Row
            title="Still due"
            subtitle="Billed and not yet paid"
            meta={whole(combined.stillDue)}
            accessibilityLabel={`Still due, billed and not yet paid: ${whole(combined.stillDue)}`}
          />
          <Row
            title="Tax collected"
            subtitle="Held for the government"
            meta={whole(resort.taxCollected + restaurant.taxCollected)}
            last
            accessibilityLabel={`Tax collected and held for the government: ${whole(resort.taxCollected + restaurant.taxCollected)}`}
          />
        </Card>

        {resort.expenseCategories.length > 0 ? (
          <Card title="What the money went on">
            {resort.expenseCategories.map((line, i) => (
              <Row
                key={line.category}
                title={line.category}
                meta={whole(line.amount)}
                last={i === resort.expenseCategories.length - 1}
                accessibilityLabel={`${line.category}: ${whole(line.amount)}`}
              />
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  period: { textAlign: "center", color: color.muted },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
});
