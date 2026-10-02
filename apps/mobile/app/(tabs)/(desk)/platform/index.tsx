/**
 * The platform, run from the phone — the console's Platform page, as a hub.
 *
 * This screen used to say "the platform console is on the desk", by the
 * owner's own earlier choice. On 2026-10-02 he chose otherwise: whatever the
 * console has, the app has. So the overview is here in figures and bars, and
 * every one of the console's twelve tabs is a tile.
 */
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import { keys, useApi } from "@rh/app-core";
import { formatMoney, type PlatformOverview } from "@rh/shared";
import { client, useAuth } from "../../../../src/api/session";
import { Button } from "../../../../src/design/button";
import { Kpi, SplitBar } from "../../../../src/design/charts";
import { Hero } from "../../../../src/design/hero";
import { useMoneyFormat } from "../../../../src/design/money";
import { Loading, Problem } from "../../../../src/design/states";
import { Card } from "../../../../src/design/surface";
import { Text } from "../../../../src/design/text";
import { Tiles, type TileIcon } from "../../../../src/design/tiles";
import { color, space } from "../../../../src/design/tokens";

const SECTIONS: { href: string; title: string; hint: string; icon: TileIcon }[] = [
  { href: "/platform/resorts", title: "Resorts", hint: "Subscribe, renew, suspend, log in as", icon: "home-city" },
  { href: "/platform/agents", title: "Agencies", hint: "Verify, wallets, log in as", icon: "account-tie" },
  { href: "/platform/plans", title: "Plans", hint: "What is sold and for how much", icon: "tag-multiple" },
  { href: "/platform/offers", title: "Offers", hint: "Deals that bring a customer", icon: "sale" },
  { href: "/platform/subscriptions", title: "Subscriptions", hint: "Every account's plan and term", icon: "card-account-details-star" },
  { href: "/platform/dues", title: "Dues", hint: "Bills and charges to collect", icon: "cash-clock" },
  { href: "/platform/money", title: "Money received", hint: "What came in, and how", icon: "cash-multiple" },
  { href: "/platform/credits", title: "Email credits", hint: "Requests and pack prices", icon: "email-multiple" },
  { href: "/platform/calendar", title: "Calendar", hint: "Renewals and dues by day", icon: "calendar-month" },
  { href: "/platform/policy", title: "Billing policy", hint: "Reminders, grace, methods", icon: "scale-balance" },
  { href: "/platform/cms", title: "Website CMS", hint: "The front page's words and brand", icon: "web" },
];

export default function PlatformHome() {
  const { me, logout } = useAuth();
  const fmt = useMoneyFormat();
  const money = (n: number) => formatMoney(n, { ...fmt, decimals: 0 });
  const ov = useApi<PlatformOverview>(keys.platform("overview"), () => client.platform.overview());

  const header = <Stack.Screen options={{ title: "Platform" }} />;
  if (ov.error && !ov.data) return (<>{header}<Problem error={ov.error} onRetry={() => void ov.refetch()} /></>);
  if (!ov.data) return (<>{header}<Loading what="the platform" /></>);
  const o = ov.data;
  const subs = o.subscriptions;

  return (
    <>
      {header}
      <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={ov.isRefetching} onRefresh={() => void ov.refetch()} />}>
        <Hero title={`Hello, ${(me?.name ?? "").split(" ")[0] || "there"}`} subtitle="Every resort, agency, plan and taka on the platform" />

        <View style={styles.figures}>
          <Kpi label="Resorts" value={`${o.resorts.active}/${o.resorts.total}`} tint={color.chart.money.paid.solid} sub={`${o.resorts.suspended} suspended`} />
          <Kpi label="Agencies" value={String(o.agents.total)} tint={color.chart.money.advance.solid} sub={`${o.agents.pending} waiting · ${o.agents.active} active`} />
          <Kpi label="Monthly revenue" value={money(subs.mrr)} tint={color.chart.money.income.solid} sub={`${subs.active} active · ${subs.trial} on trial`} />
          <Kpi label="Dues outstanding" value={money(o.duesOutstanding)} tint={o.duesOutstanding > 0 ? color.chart.money.late.solid : color.ink[400]} sub={`${subs.pastDue} past due`} />
        </View>

        {o.demoExcluded.resorts + o.demoExcluded.agencies > 0 ? (
          <Text step="small" tone="warn">
            {`These figures leave out ${o.demoExcluded.resorts} demo resort${o.demoExcluded.resorts === 1 ? "" : "s"} and ${o.demoExcluded.agencies} demo agenc${o.demoExcluded.agencies === 1 ? "y" : "ies"}. They are still listed.`}
          </Text>
        ) : null}

        <Card title="Subscription funnel">
          <SplitBar
            format={(n) => String(n)}
            parts={[
              { label: "Trial", value: subs.trial, color: color.ink[400] },
              { label: "Active", value: subs.active, color: color.chart.money.paid.solid },
              { label: "Past due", value: subs.pastDue, color: color.chart.money.left.solid },
              { label: "Cancelled", value: subs.cancelled, color: color.chart.money.late.solid },
            ]}
          />
        </Card>

        <Tiles items={SECTIONS.map((s) => ({ key: s.href, title: s.title, hint: s.hint, icon: s.icon, onPress: () => router.push(s.href as never) }))} />

        <Button
          label="Sign out"
          kind="ghost"
          onPress={() => {
            logout();
            router.replace("/login");
          }}
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
});
