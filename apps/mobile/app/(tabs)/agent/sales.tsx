/**
 * What the agency quoted, what it billed, and what is still owed.
 *
 * An agency quotes, the client accepts, the quote becomes an invoice and
 * the money comes in. Writing those documents is desk work — line items,
 * a tax rate, terms, a printable copy — and none of it is one-handed.
 *
 * What is one-handed is the question an owner asks away from the desk:
 * **who has not paid?** So this reads the list, sums what is left, and
 * opens one. Writing a quote stays on the desk and the screen says so,
 * which is the rule every absence in this app follows.
 *
 * The status decides what a row means. A quote that expired, one that
 * was declined, an invoice already paid and a voided document are all
 * finished, and counting any of them as outstanding sends somebody
 * chasing money they already have or never will.
 */
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import { useApi } from "@rh/app-core";
import { dayLabel, formatMoney, type SalesDocRow, type SalesDocStatus } from "@rh/shared";
import { client, useAuth } from "../../../src/api/session";
import { Chip } from "../../../src/design/chip";
import { useMoneyFormat } from "../../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../../src/design/states";
import { Card, Row, Stat } from "../../../src/design/surface";
import { Text } from "../../../src/design/text";
import { space } from "../../../src/design/tokens";

/**
 * Finished, one way or another.
 *
 * `due` alone is not enough: a voided invoice can carry a balance and is
 * not money coming. The status is the fact and the figure follows it.
 */
const SETTLED: SalesDocStatus[] = ["PAID", "VOID", "DECLINED", "EXPIRED"];

const owing = (d: SalesDocRow) => !SETTLED.includes(d.status) && d.totals.due > 0;

const LENSES = ["All", "Owing"] as const;

export default function AgentSalesScreen() {
  const { me } = useAuth();
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });
  const [lens, setLens] = useState<(typeof LENSES)[number]>("All");

  const list = useApi<SalesDocRow[]>(["agent-sales"], () => client.agent.sales.list(), {
    enabled: Boolean(me),
  });

  const all = useMemo(() => list.data ?? [], [list.data]);
  const outstanding = useMemo(
    () => all.filter(owing).reduce((s, d) => s + d.totals.due, 0),
    [all],
  );
  const shown = lens === "Owing" ? all.filter(owing) : all;

  /**
   * No `title` here. A tab is named by the bar, which runs the
   * console's label through `barLabel` so it fits; a title set on the
   * screen overrides that from underneath and the bar goes back to
   * an ellipsis. `a-tab-does-not-name-itself.spec.ts` is the rule.
   */
  const header = null;

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
        <Loading what="the quotes and invoices" />
      </>
    );
  }

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
        <View style={styles.figures}>
          <Stat
            label="Still owed"
            value={whole(outstanding)}
            sub={`${all.filter(owing).length} document${all.filter(owing).length === 1 ? "" : "s"}`}
            tone={outstanding > 0 ? "danger" : "title"}
          />
          <Stat label="On the books" value={String(all.length)} sub="quotes and invoices" />
        </View>

        <View style={styles.lenses}>
          {LENSES.map((l) => (
            <Chip key={l} label={l} on={lens === l} onPress={() => setLens(l)} />
          ))}
        </View>

        <Card title={lens === "Owing" ? "Still owing" : "Everything"}>
          {shown.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty
                message={lens === "Owing" ? "Nothing outstanding" : "Nothing quoted yet"}
                hint={
                  lens === "Owing"
                    ? "Every document on the books is settled."
                    : "Quotes are written at the desk and appear here."
                }
              />
            </View>
          ) : (
            shown.map((d, i) => (
              <Row
                key={d.id}
                title={d.number}
                subtitle={d.clientName}
                meta={`${kindOf(d)} · ${statusOf(d.status)} · ${dayLabel(d.issueDate, { style: "short" })}`}
                last={i === shown.length - 1}
                accessibilityLabel={`${d.number}, ${kindOf(d)} for ${d.clientName}, ${statusOf(
                  d.status,
                )}, ${owing(d) ? `${whole(d.totals.due)} still owed` : "settled"}`}
                onPress={() => router.push(`/agent/sales/${d.id}` as never)}
                right={
                  owing(d) ? (
                    <View style={styles.right}>
                      <Text step="caption" tone="muted">
                        due
                      </Text>
                      <Text step="body" weight="medium" tone="danger" tabular>
                        {whole(d.totals.due)}
                      </Text>
                    </View>
                  ) : (
                    <Text step="small" tone="muted">
                      {statusOf(d.status).toLowerCase()}
                    </Text>
                  )
                }
              />
            ))
          )}
        </Card>

        <Text step="caption" tone="muted" style={styles.footnote}>
          Writing a quote stays on the desk. Line items, a tax rate and terms
          are not one-handed work, and the printed copy a client keeps is
          worth a wide screen.
        </Text>
      </ScrollView>
    </>
  );
}

/** "Quotation" or "Invoice" — the two are not the same promise. */
function kindOf(d: SalesDocRow): string {
  return d.kind === "QUOTATION" ? "Quotation" : "Invoice";
}

/** Sentence case, as everywhere else in this app. */
function statusOf(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  lenses: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  right: { alignItems: "flex-end" },
  emptyBox: { paddingVertical: space.lg },
  footnote: { textAlign: "center" },
});
