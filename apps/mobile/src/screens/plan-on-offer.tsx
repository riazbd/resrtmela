/**
 * The plan a signup is about to open on, on the form itself.
 *
 * Not the price list again. `/plans` is where plans are compared; by the
 * time somebody is typing their phone number the question is only "is
 * this still the one?", and a second grid of cards inside a form is how
 * a form stops looking like a form.
 *
 * So: one line saying what was chosen and what it costs, and a way to
 * change it that does not leave the page. The web embeds its card grid
 * because it has the width; a phone does not, and copying that layout
 * here would push the actual fields below the fold.
 *
 * It says something even while the shelf is loading, because a form that
 * silently appears to include no plan and then suddenly does is a form
 * somebody submits at the wrong moment.
 */
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  formatMoney,
  planCaps,
  plannedShelf,
  type PlanAudience,
  type PlanOnSale,
} from "@rh/shared";
import { Chip } from "../design/chip";
import { Text } from "../design/text";
import { color, radius, space } from "../design/tokens";

export function PlanOnOffer({
  plans,
  plan,
  shelfId,
  audience,
  onPlan,
  onShelf,
  loading,
}: {
  plans: PlanOnSale[] | undefined;
  plan: PlanOnSale | null;
  shelfId: number | null;
  audience: PlanAudience;
  onPlan: (name: string) => void;
  onShelf: (id: number) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const shelf = plannedShelf(plan, shelfId);
  const money = (n: number) => formatMoney(n, { decimals: 0 });

  if (loading && !plan) {
    return (
      <View style={styles.box}>
        <Text step="small" tone="muted">
          Fetching the price list…
        </Text>
      </View>
    );
  }

  /**
   * No plans published at all. The signup still works — the API opens
   * the entry plan when nothing is named — so this says nothing rather
   * than blocking a person from opening a workspace.
   */
  if (!plan) return null;

  const settles = shelf?.phases.at(-1)?.amount ?? shelf?.openingFee ?? 0;
  const introductory = shelf ? settles !== shelf.openingFee : false;

  return (
    <View style={styles.box}>
      <View style={styles.line}>
        <View style={styles.what}>
          <Text step="caption" tone="muted" weight="medium">
            PLAN
          </Text>
          <Text step="body" weight="medium" tone="title" numberOfLines={1}>
            {plan.label}
          </Text>
          <Text step="small" tone="muted" numberOfLines={1}>
            {shelf
              ? `${shelf.openingFee === 0 ? "Free" : money(shelf.openingFee)} to start${
                  introductory ? `, then ${money(settles)}` : ""
                } · ${shelf.label.toLowerCase()}`
              : planCaps(plan, audience)}
          </Text>
        </View>
        {(plans?.length ?? 0) > 1 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={open ? "Keep this plan" : "Change plan"}
            onPress={() => setOpen((v) => !v)}
            hitSlop={space.sm}
          >
            <Text step="small" weight="medium" tone="ok">
              {open ? "Done" : "Change"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/*
        Opened in place, not pushed. Somebody half-way through a form who
        is sent to another screen to pick a plan comes back to an empty
        one — or does not come back.
      */}
      {open ? (
        <View style={styles.choices}>
          {(plans ?? []).map((p) => (
            <Chip
              key={p.name}
              label={p.label}
              on={p.name === plan.name}
              onPress={() => onPlan(p.name)}
            />
          ))}
        </View>
      ) : null}

      {plan.schedules.length > 1 ? (
        <View style={styles.choices}>
          {plan.schedules.map((s) => (
            <Chip
              key={s.id}
              label={s.savingPct > 0 ? `${s.label} · save ${s.savingPct}%` : s.label}
              on={shelf?.id === s.id}
              onPress={() => onShelf(s.id)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: space.sm,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  line: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space.md },
  what: { flex: 1, gap: 2 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
