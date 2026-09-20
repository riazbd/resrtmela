/**
 * What it costs, before anybody has an account.
 *
 * The web has shown this since the homepage had prices: read the cards,
 * press one, land on a signup that already knows which plan. The phone
 * showed nothing at all and sent no plan, so everybody who signed up on
 * a phone got the entry plan whatever they had been told.
 *
 * **Shaped for a phone, not shrunk from the web.** The desk draws three
 * columns side by side and lets an eye compare them at a glance; a
 * phone cannot, and three columns squeezed into 393 points is how a
 * price list becomes unreadable. So: one card per plan, full width,
 * stacked; the way of paying is a row of chips *inside* each card
 * because that is the choice being made about that plan; and the card
 * itself is the button, because on a phone the whole card is where a
 * thumb lands.
 *
 * Two lines of claim per card, not the web's tick list. A phone screen
 * that needs scrolling to compare two plans is a screen that compares
 * nothing.
 */
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router } from "expo-router";
import { useApi } from "@rh/app-core";
import {
  formatMoney,
  planCaps,
  plannedShelf,
  sharedTrialDays,
  type PlanAudience,
  type PlanOnSale,
  type PlanSchedule,
} from "@rh/shared";
import { client } from "../src/api/session";
import { Chip } from "../src/design/chip";
import { Empty, Loading, Problem } from "../src/design/states";
import { Text } from "../src/design/text";
import { color, radius, space } from "../src/design/tokens";

const AUDIENCES: { key: PlanAudience; label: string }[] = [
  { key: "RESORT", label: "For a resort" },
  { key: "AGENCY", label: "For an agency" },
];

export default function PlansScreen() {
  const [audience, setAudience] = useState<PlanAudience>("RESORT");

  const list = useApi<PlanOnSale[]>(["plans", audience], () => client.auth.plansOnSale(audience));

  const header = <Stack.Screen options={{ title: "What it costs" }} />;
  const plans = list.data ?? [];
  const trial = sharedTrialDays(plans);

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
        <Loading what="the price list" />
      </>
    );
  }

  return (
    <>
      {header}
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />
        }
      >
        <View style={styles.audience}>
          {AUDIENCES.map((a) => (
            <Chip
              key={a.key}
              label={a.label}
              on={audience === a.key}
              onPress={() => setAudience(a.key)}
            />
          ))}
        </View>

        {/*
          Only when every plan agrees. A single trial figure over a list
          whose rows disagree is a claim about a plan nobody chose.
        */}
        {trial !== null && trial > 0 ? (
          <Text step="small" tone="ok" weight="medium">
            Free for {trial} day{trial === 1 ? "" : "s"}. Nothing is charged today.
          </Text>
        ) : null}

        {plans.length === 0 ? (
          <Empty
            message="No plans on sale"
            hint="The platform has not published a price list yet."
          />
        ) : (
          plans.map((plan) => <PlanCard key={plan.name} plan={plan} audience={audience} />)
        )}
      </ScrollView>
    </>
  );
}

function PlanCard({ plan, audience }: { plan: PlanOnSale; audience: PlanAudience }) {
  /**
   * Which way of paying is being looked at.
   *
   * Local to the card, not to the screen: a visitor comparing Starter
   * monthly against Chain yearly is comparing two real offers, and a
   * single toggle at the top would keep silently changing the other
   * cards under them.
   */
  const [shelfId, setShelfId] = useState<number | null>(null);
  const shelf = plannedShelf(plan, shelfId);

  const money = useCallback(
    (n: number) => formatMoney(n, { decimals: 0 }),
    [],
  );

  const start = () => {
    const path = audience === "AGENCY" ? "/signup/agency" : "/signup";
    router.push(
      `${path}?plan=${encodeURIComponent(plan.name)}${shelf ? `&schedule=${shelf.id}` : ""}` as never,
    );
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${plan.label}, ${shelf ? money(shelf.openingFee) : ""}, ${planCaps(plan, audience)}. Start`}
      onPress={start}
      style={({ pressed }) => [
        styles.card,
        plan.highlight ? styles.pick : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.head}>
        <Text step="strong" weight="medium" tone="title" numberOfLines={1}>
          {plan.label}
        </Text>
        {plan.highlight ? (
          <View style={styles.flag}>
            <Text step="caption" weight="medium" tone="onBrand">
              Most take this
            </Text>
          </View>
        ) : null}
      </View>

      {plan.blurb ? (
        <Text step="small" tone="muted" numberOfLines={2}>
          {plan.blurb}
        </Text>
      ) : null}

      {shelf ? <Price shelf={shelf} money={money} /> : null}

      <Text step="small" tone="body" numberOfLines={1}>
        {planCaps(plan, audience)}
      </Text>

      {/*
        The ways of paying, inside the card. More than one is common —
        the owner writes as many as they like — and one is not a choice,
        so it is stated rather than offered.
      */}
      {plan.schedules.length > 1 ? (
        <View style={styles.shelves}>
          {plan.schedules.map((s) => (
            <Chip
              key={s.id}
              label={s.savingPct > 0 ? `${s.label} · save ${s.savingPct}%` : s.label}
              on={shelf?.id === s.id}
              onPress={() => setShelfId(s.id)}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.go}>
        <Text step="small" weight="medium" tone="ok">
          Start with {plan.label} →
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * What pressing the button charges, and what it settles at.
 *
 * Both, because a ladder that shows only its first rung is an
 * advertisement rather than a price: "free for a week" matters, and so
 * does what happens in week two.
 */
function Price({ shelf, money }: { shelf: PlanSchedule; money: (n: number) => string }) {
  const settles = shelf.phases.at(-1)?.amount ?? shelf.openingFee;
  const introductory = settles !== shelf.openingFee;
  return (
    <View style={styles.price}>
      <Text step="figure" weight="bold" tone="title" tabular numberOfLines={1}>
        {shelf.openingFee === 0 ? "Free" : money(shelf.openingFee)}
      </Text>
      <Text step="small" tone="muted" numberOfLines={1}>
        {introductory
          ? `to start, then ${money(settles)} · ${shelf.label.toLowerCase()}`
          : shelf.label.toLowerCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.md },
  audience: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  card: {
    gap: space.sm,
    padding: space.lg,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  // the owner's own flag, drawn as a border rather than a fill so the
  // card it marks is still a card and not a banner
  pick: { borderColor: color.brand[600] },
  pressed: { backgroundColor: color.ink[50] },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  flag: {
    backgroundColor: color.brand[600],
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  price: { gap: 2, paddingTop: space.xs },
  shelves: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, paddingTop: space.xs },
  go: { paddingTop: space.xs },
});
