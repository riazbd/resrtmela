/**
 * What is still owed, and who to ask for it.
 *
 * Two questions wearing one coat, which is why the lens exists: a guest's
 * balance is collected at the desk on the morning they leave, an agency's is
 * invoiced between two businesses, and one red total covering both was a
 * number nobody could act on. `duesThrough` is shared with the console so
 * that what counts as an agency booking is decided once.
 *
 * The route is `/payments`, as it is on the desk, because the console's paths
 * are the app's paths. Taking the money is not here yet — that arrives with
 * the rest of the write screens.
 */
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import { DUES_LENSES, duesThrough, formatMoney, type DuesLens, type DuesReport } from "@rh/shared";
import { client, useAuth } from "../../../src/api/session";
import { WhichResort } from "../../../src/screens/which-resort";
import { useMoneyFormat } from "../../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../../src/design/states";
import { Card, Row, Stat } from "../../../src/design/surface";
import { Lenses } from "../../../src/design/lenses";
import { Text } from "../../../src/design/text";
import { space } from "../../../src/design/tokens";

export default function DuesScreen() {
  const { activeResort } = useAuth();
  const resortId = activeResort?.id;
  const money = useMoneyFormat();
  const whole = useCallback(
    (amount: number) => formatMoney(amount, { ...money, decimals: 0 }),
    [money],
  );

  const [lens, setLens] = useState<DuesLens>("Everyone");

  const dues = useApi(keys.dues(resortId), () => client.dues(resortId!), {
    enabled: resortId !== undefined,
  });

  const header = <Stack.Screen options={{ title: "Dues" }} />;

  if (resortId === undefined) {
    return (
      <>
        {header}
        <WhichResort what="what is owed" />
      </>
    );
  }
  if (dues.error && !dues.data) {
    return (
      <>
        {header}
        <Problem error={dues.error} onRetry={() => void dues.refetch()} />
      </>
    );
  }
  if (!dues.data) {
    return (
      <>
        {header}
        <Loading what="what is owed" />
      </>
    );
  }

  const report = dues.data;
  const seen = duesThrough(report, lens);

  return (
    <>
      {header}
      <Stale age={dues.stale} />
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl refreshing={dues.isRefetching} onRefresh={() => void dues.refetch()} />
        }
      >
        <View style={styles.figures}>
          <Stat
            label="Outstanding"
            value={whole(report.total)}
            sub={`${report.count} booking${report.count === 1 ? "" : "s"}`}
            tone={report.total > 0 ? "danger" : "title"}
          />
          <Stat label="Due from guests" value={whole(report.guestTotal)} sub="collected at the desk" />
          <Stat label="Due from agencies" value={whole(report.agencyTotal)} sub="settled on account" />
        </View>

        <Lenses
          options={DUES_LENSES}
          value={lens}
          onChange={setLens}
          countOf={(option) => duesThrough(report, option).count}
        />

        {/* who to ring: four bookings from one agency are one phone call,
            and this is the only place on the screen that says so */}
        {lens === "Agencies" && report.byAgency.length > 0 ? (
          <Card title="Due from each agency">
            {report.byAgency.map((a, i) => (
              <Row
                key={a.accountId ?? a.agency}
                title={a.agency}
                subtitle={`${a.bookings} booking${a.bookings === 1 ? "" : "s"}`}
                last={i === report.byAgency.length - 1}
                accessibilityLabel={`${a.agency}, ${a.bookings} booking${a.bookings === 1 ? "" : "s"}, ${whole(a.due)}`}
                right={
                  <Text step="body" weight="medium" tone="danger" tabular>
                    {whole(a.due)}
                  </Text>
                }
              />
            ))}
          </Card>
        ) : null}

        <Card title={`${whole(seen.total)} across ${seen.count}`}>
          {seen.rows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty message={nothingHere(lens, report)} />
            </View>
          ) : (
            seen.rows.map((row, i) => (
              <DueRow key={row.id} row={row} last={i === seen.rows.length - 1} whole={whole} />
            ))
          )}
        </Card>
      </ScrollView>
    </>
  );
}

/**
 * An empty lens is not an empty resort.
 *
 * "Nothing outstanding" on the agency tab, while a guest still owes ৳4,000,
 * is a lie told by a filter — so the sentence says which question came back
 * empty unless the answer really is "all of them".
 */
function nothingHere(lens: DuesLens, report: DuesReport): string {
  if (report.count === 0) return "Nothing outstanding";
  if (lens === "Agencies") return "Nothing due from any agency";
  if (lens === "Guests") return "Nothing due from any guest";
  return "Nothing outstanding";
}

function DueRow({
  row,
  last,
  whole,
}: {
  row: DuesReport["rows"][number];
  last: boolean;
  whole: (amount: number) => string;
}) {
  const who = row.guest?.fullName ?? "—";
  const sold = row.agent ? ` · ${row.agent.agency}` : "";
  return (
    <Row
      title={who}
      subtitle={`${row.code}${sold}`}
      meta={`${row.nights} night${row.nights === 1 ? "" : "s"} · paid ${whole(row.paid)} of ${whole(row.total)}`}
      last={last}
      accessibilityLabel={`${who}, ${row.code}, ${whole(row.due)} due`}
      onPress={() => router.push(`/bookings/${row.id}` as never)}
      right={
        <Text step="body" weight="medium" tone="danger" tabular>
          {whole(row.due)}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  emptyBox: { paddingVertical: space.lg },
});
