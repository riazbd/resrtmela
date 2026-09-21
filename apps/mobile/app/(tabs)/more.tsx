/**
 * Everything that did not fit on the bar.
 *
 * In the console's own order, because somebody who learned the sidebar on
 * the desk should find the same things in the same sequence here. Filtered
 * by the same `navVisible`, so nothing on this list answers 403.
 *
 * The footer is the console's sidebar footer: who is signed in, the account
 * link, and the way out. Changing your own password is not in `CONSOLE_NAV`
 * — it belongs to whoever is signed in, whatever they are — so this screen
 * adds it rather than filtering for it.
 */
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Link, router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useT } from "@rh/app-core";
import { ACCOUNT_HREF, isResortless, type NavDestination, type Resort } from "@rh/shared";
import { useAuth } from "../../src/api/session";
import { Button } from "../../src/design/button";
import { Text } from "../../src/design/text";
import { TOUCH_TARGET, color, radius, space } from "../../src/design/tokens";
import { iconFor } from "../../src/nav/icons";
import { moreFor } from "../../src/nav/tabs";
import { UpdateOnOffer } from "../../src/screens/update-on-offer";

function Row({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href as never} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={label}
        style={({ pressed }) => (pressed ? styles.pressed : null)}
      >
        {/*
          The layout is on this View and not on the Pressable, and that is
          the whole fix. `Link asChild` clones its child and passes a
          `style` of its own, which replaced the one carrying
          `flexDirection: "row"` — so every row drew as a column: icon on
          one line, the name under it, the chevron under that and on the
          left. The owner saw it before any of us did; a browser never
          showed it because react-native-web resolves the clone
          differently.

          A Pressable that owns only its pressed tint cannot lose a
          layout it does not hold.
        */}
        <View style={styles.row}>
          <MaterialCommunityIcons name={iconFor(href)} size={20} color={color.muted} />
          <Text step="body" tone="title" style={styles.rowLabel} numberOfLines={1}>
            {label}
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color={color.ink[300]} />
        </View>
      </Pressable>
    </Link>
  );
}

export default function More() {
  const { me, role, can, features, activeResort, setActiveResort, logout } = useAuth();
  const t = useT();

  const destinations = me ? moreFor({ role, can, features }) : [];

  /**
   * An agency signs in for an account, staff sign in at a resort, and
   * somebody with neither is told nothing rather than something wrong.
   */
  const whose =
    role === "AGENT"
      ? me?.account
        ? { kind: "AGENCY", name: me.account.name }
        : null
      : activeResort
        ? { kind: "RESORT", name: activeResort.name }
        : null;
  const titleOf = (d: NavDestination) =>
    d.labelKey ? t(d.labelKey as never) : (d.label ?? d.href);

  /**
   * The resorts this person works at, when that is more than one.
   *
   * `WhichResort` has told every empty screen in this app to *choose a
   * resort from the More tab* since it was written, and the More tab has
   * never had one: somebody managing two properties got whichever resort
   * `/auth/me` listed first and no way to reach the other from the phone.
   * The console has had the switcher in its header all along.
   *
   * `isResortless` rather than a role test of this screen's own, because
   * for an agency `me.resorts` is the list it may *sell*, not the list it
   * works at — switching between them changes nothing, and offering the
   * choice says it does.
   */
  const switchable: Resort[] =
    me && !isResortless(role) && me.resorts.length > 1
      ? me.resorts.map((r) => r.resort)
      : [];

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {/*
        Who is signed in, which is not always a resort.

        This read "RESORT · Sky Eco Resort" to an agency — somebody
        else's business, picked because the session takes the first of
        `me.resorts` and that field means two things. For staff it is
        where they work; for an agency it is who they may sell.
        `consoleGate` has called AGENT resortless since it was written,
        and this screen had not heard.

        It is a heading only while there is nothing to choose. With two
        resorts the name below is the same sentence with a tap in it,
        and printing it twice says the top one is something else.
      */}
      {whose && switchable.length === 0 ? (
        <View style={styles.header}>
          <Text step="caption" tone="muted" weight="medium">
            {whose.kind}
          </Text>
          <Text step="strong" weight="medium" tone="title">
            {whose.name}
          </Text>
        </View>
      ) : null}

      {switchable.length > 0 ? (
        <View style={styles.card}>
          {switchable.map((resort) => {
            const here = resort.id === activeResort?.id;
            return (
              <Pressable
                key={resort.id}
                accessibilityRole="button"
                accessibilityState={{ selected: here }}
                accessibilityLabel={`${resort.name}${here ? ", where you are working" : ""}`}
                onPress={() => setActiveResort(resort)}
                style={({ pressed }) => (pressed ? styles.pressed : null)}
              >
                <View style={styles.row}>
                  <MaterialCommunityIcons
                    name={here ? "check-circle" : "circle-outline"}
                    size={20}
                    color={here ? color.brand[600] : color.ink[300]}
                  />
                  <Text
                    step="body"
                    tone="title"
                    weight={here ? "medium" : undefined}
                    style={styles.rowLabel}
                    numberOfLines={1}
                  >
                    {resort.name}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.card}>
        {destinations.length === 0 ? (
          <View style={styles.empty}>
            <Text step="body" tone="muted">
              Nothing else has been opened to you yet.
            </Text>
          </View>
        ) : (
          destinations.map((d) => <Row key={d.href} href={d.href} label={titleOf(d)} />)
        )}
      </View>

      <View style={styles.card}>
        {me ? (
          <View style={styles.who}>
            <Text step="body" weight="medium" tone="title">
              {me.name}
            </Text>
            <Text step="caption" tone="muted">
              {role.replace(/_/g, " ")}
            </Text>
          </View>
        ) : null}
        <Row href={ACCOUNT_HREF} label="Password" />
      </View>

      <Button
        label="Sign out"
        kind="ghost"
        onPress={() => {
          logout();
          router.replace("/login");
        }}
      />

      {/*
        Which build this is, and whether there is a newer one. Here
        rather than over the day sheet: a release announced to somebody
        with a queue at the desk is a release they dismiss. It is also
        the answer to the first question of every support call.
      */}
      <UpdateOnOffer />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  header: { gap: space.xs },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.line,
    overflow: "hidden",
  },
  row: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    // a thin rule between rows, which is how a dense screen separates things
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
  rowLabel: { flex: 1 },
  pressed: { backgroundColor: color.ink[50] },
  who: { paddingHorizontal: space.lg, paddingTop: space.md, gap: 2 },
  empty: { padding: space.lg },
});
