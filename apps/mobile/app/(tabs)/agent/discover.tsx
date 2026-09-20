/**
 * The resorts an agency may sell.
 *
 * `landingFor("AGENT")` is this screen, so it is the first thing an
 * agency sees after signing in. It said "Not built yet" until phase 3,
 * as did the other three agent tabs — which made the app, for an agency,
 * a sign-in form and a wall.
 *
 * The field that decides everything here is `access`. An agency the
 * platform has not verified sees every resort and can book none of them,
 * and the server sends the reason in its own words. A list that looks
 * identical either way and quietly does nothing when tapped is how
 * somebody spends an afternoon before ringing the office.
 *
 * No resort is chosen here, so there is no `activeResort` to wait for —
 * an agency belongs to no resort at all, which is the whole difference
 * between this side of the app and the other. What it waits for is the
 * session, and `WhichResort` is not the shape of that wait.
 */
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import { useApi } from "@rh/app-core";
import { formatMoney, type DiscoverResort } from "@rh/shared";
import { client, useAuth } from "../../../src/api/session";
import { useMoneyFormat } from "../../../src/design/money";
import { Empty, Loading, Problem, Stale } from "../../../src/design/states";
import { Card, Row } from "../../../src/design/surface";
import { Text } from "../../../src/design/text";
import { color, radius, space } from "../../../src/design/tokens";

export default function DiscoverScreen() {
  const { me, loading } = useAuth();
  const money = useMoneyFormat();
  const whole = (n: number) => formatMoney(n, { ...money, decimals: 0 });

  const list = useApi<DiscoverResort[]>(["agent-discover"], () => client.agent.discover(), {
    enabled: Boolean(me),
  });

  /**
   * No `title` here. A tab is named by the bar, which runs the
   * console's label through `barLabel` so it fits; a title set on the
   * screen overrides that from underneath and the bar goes back to
   * an ellipsis. `a-tab-does-not-name-itself.spec.ts` is the rule.
   */
  const header = null;

  if (loading || (!list.data && !list.error)) {
    return (
      <>
        {header}
        <Loading what="the resorts" />
      </>
    );
  }

  if (list.error && !list.data) {
    return (
      <>
        {header}
        <Problem error={list.error} onRetry={() => void list.refetch()} />
      </>
    );
  }

  const rows = list.data ?? [];
  /**
   * The refusal is the agency's, not the resort's — every row carries the
   * same one — so it is said once at the top rather than thirteen times
   * down the list.
   */
  const refused = rows.find((r) => r.access === "WAITING")?.reason ?? null;
  const waiting = rows.some((r) => r.access === "WAITING");

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
        {waiting ? (
          <View style={styles.waiting}>
            <Text step="small" weight="medium" tone="warn">
              {refused ?? "The platform has not verified this agency yet."}
            </Text>
            <Text step="caption" tone="muted">
              You can see what there is. Booking opens once this is settled.
            </Text>
          </View>
        ) : null}

        <Card title={`${rows.length} resort${rows.length === 1 ? "" : "s"}`}>
          {rows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Empty
                message="No resorts open to you yet"
                hint="A resort has to sell through agencies before it appears here."
              />
            </View>
          ) : (
            rows.map((r, i) => (
              <Row
                key={r.id}
                title={r.name}
                // two lines, not one joined by a dot: "Konglak Vip Zone,
                // Sajek Valley, Rangamati" is a real location in this data
                // and it ate the room count on the first phone that drew it
                subtitle={r.location ?? undefined}
                meta={size(r)}
                last={i === rows.length - 1}
                accessibilityLabel={`${r.name}${r.location ? `, ${r.location}` : ""}, ${size(r)}${
                  r.priceFrom === null ? "" : `, from ${whole(r.priceFrom)} a night`
                }${r.access === "OPEN" ? "" : ", not yet bookable"}`}
                // a row that cannot be booked does not pretend it can
                onPress={
                  r.access === "OPEN"
                    ? () => router.push(`/agent/search?resortId=${r.id}` as never)
                    : undefined
                }
                right={
                  // a resort with no rooms has no price; ৳0 would read as free
                  r.priceFrom === null ? (
                    <Text step="small" tone="muted">
                      no rooms
                    </Text>
                  ) : (
                    <View style={styles.price}>
                      <Text step="caption" tone="muted">
                        from
                      </Text>
                      <Text step="body" weight="medium" tone="title" tabular>
                        {whole(r.priceFrom)}
                      </Text>
                    </View>
                  )
                }
              />
            ))
          )}
        </Card>
      </ScrollView>
    </>
  );
}

/** "10 rooms · 3 kinds", and the singulars that stop it reading like a form. */
function size(r: DiscoverResort): string {
  const rooms = `${r.roomCount} room${r.roomCount === 1 ? "" : "s"}`;
  if (r.roomTypeCount === 0) return rooms;
  return `${rooms}, ${r.roomTypeCount} kind${r.roomTypeCount === 1 ? "" : "s"}`;
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  price: { alignItems: "flex-end" },
  emptyBox: { paddingVertical: space.lg },
  waiting: {
    backgroundColor: color.warn.bg,
    borderWidth: 1,
    borderColor: color.warn.line,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.xs,
  },
});
