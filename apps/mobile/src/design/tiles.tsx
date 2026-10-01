/**
 * A grid of places to go, each a coloured icon, a name and a line about it.
 *
 * Menus on this app were lists of text rows; a person looking for "the
 * website" read every row to find it. A tile is found by its colour and its
 * picture first, and read only to be sure.
 */
import { Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text } from "./text";
import { color, elevation, radius, space } from "./tokens";

export type TileIcon = keyof typeof MaterialCommunityIcons.glyphMap;

export interface TileItem {
  key: string;
  title: string;
  hint?: string;
  icon: TileIcon;
  onPress: () => void;
}

export function Tiles({ items }: { items: TileItem[] }) {
  return (
    <View style={styles.grid}>
      {items.map((t, i) => (
        <Pressable
          key={t.key}
          accessibilityRole="button"
          accessibilityLabel={t.hint ? `${t.title}, ${t.hint}` : t.title}
          onPress={t.onPress}
          style={({ pressed }) => [styles.tile, pressed ? styles.pressed : null]}
        >
          <View style={[styles.icon, { backgroundColor: color.chart.series[i % color.chart.series.length] }]}>
            <MaterialCommunityIcons name={t.icon} size={22} color={color.onBrand} />
          </View>
          <Text step="body" weight="bold" tone="title" numberOfLines={1}>
            {t.title}
          </Text>
          {t.hint ? (
            <Text step="caption" tone="muted" numberOfLines={2}>
              {t.hint}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  tile: {
    flexGrow: 1,
    flexBasis: "45%",
    minHeight: 120,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.xs,
    borderWidth: 1,
    borderColor: color.ink[100],
    ...elevation.raised,
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginBottom: space.xs },
});
