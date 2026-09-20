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
import { ACCOUNT_HREF, type NavDestination } from "@rh/shared";
import { useAuth } from "../../src/api/session";
import { Button } from "../../src/design/button";
import { Text } from "../../src/design/text";
import { TOUCH_TARGET, color, radius, space } from "../../src/design/tokens";
import { iconFor } from "../../src/nav/icons";
import { moreFor } from "../../src/nav/tabs";

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
  const { me, role, can, features, activeResort, logout } = useAuth();
  const t = useT();

  const destinations = me ? moreFor({ role, can, features }) : [];
  const titleOf = (d: NavDestination) =>
    d.labelKey ? t(d.labelKey as never) : (d.label ?? d.href);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {activeResort ? (
        <View style={styles.header}>
          <Text step="caption" tone="muted" weight="medium">
            RESORT
          </Text>
          <Text step="strong" weight="medium" tone="title">
            {activeResort.name}
          </Text>
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
