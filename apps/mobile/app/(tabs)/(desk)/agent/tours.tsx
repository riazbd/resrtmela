/**
 * The packages an agency sells, and what it makes on each.
 *
 * A package is built line by line — a jeep, two nights, three meals —
 * with a cost and a price against every one of them. That is desk work,
 * and the screen says so.
 *
 * What belongs on a phone is the question an owner asks between
 * meetings: **what do we sell, and at what margin?** Cost and price are
 * different numbers and the difference is the business, so both are
 * here and the margin is drawn rather than left to be worked out.
 */
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { useApi } from "@rh/app-core";
import { formatMoney, type TourPackageRow } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { useMoneyFormat } from "../../../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../../../src/design/states";
import { Card, Row } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { space } from "../../../../src/design/tokens";

export default function AgentToursScreen() {
  const { me } = useAuth();
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });

  const list = useApi<TourPackageRow[]>(
    ["agent-tours"],
    () => client.agent.tours.packages(),
    { enabled: Boolean(me) },
  );

  const header = <Stack.Screen options={{ title: "Tours" }} />;

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
        <Loading what="the packages" />
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
        <Card title={`${rows.length} package${rows.length === 1 ? "" : "s"}`}>
          {rows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty
                message="No packages yet"
                hint="A package is built at the desk, line by line."
              />
            </View>
          ) : (
            rows.map((p, i) => (
              <Row
                key={p.id}
                title={p.name}
                subtitle={p.summary ?? undefined}
                meta={`${p.days} day${p.days === 1 ? "" : "s"}, ${p.nights} night${
                  p.nights === 1 ? "" : "s"
                } · ${p.pax} people · ${p.lines} line${p.lines === 1 ? "" : "s"}${
                  p.active ? "" : " · not on sale"
                }`}
                last={i === rows.length - 1}
                accessibilityLabel={`${p.name}, ${p.days} days and ${p.nights} nights for ${
                  p.pax
                } people, sells at ${whole(p.totals.price)}, margin ${whole(p.totals.margin)}${
                  p.active ? "" : ", not on sale"
                }`}
                right={
                  <View style={styles.right}>
                    <Text
                      step="body"
                      weight="medium"
                      tone={p.active ? "title" : "muted"}
                      tabular
                    >
                      {whole(p.totals.price)}
                    </Text>
                    {/* the margin, because the price alone is not the
                        business — it is the difference that is */}
                    <Text step="caption" tone={p.totals.margin > 0 ? "ok" : "danger"} tabular>
                      {whole(p.totals.margin)} margin
                    </Text>
                  </View>
                }
              />
            ))
          )}
        </Card>

        <Text step="caption" tone="muted" style={styles.footnote}>
          Building a package stays on the desk. Every line carries a cost and
          a price, and getting one wrong is a tour sold at a loss.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  right: { alignItems: "flex-end", gap: 2 },
  emptyBox: { paddingVertical: space.lg },
  footnote: { textAlign: "center" },
});
