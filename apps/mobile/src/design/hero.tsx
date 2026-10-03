/**
 * The top of the dashboard: a greeting over the resort scene, with the day's
 * figures on frosted glass. The console draws the same card
 * (`apps/web/src/components/hero.tsx`); on a phone it is the first thing
 * anybody sees, so it is the one place the app is a picture before a tool.
 */
import type { ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { ResortScene } from "./art";
import { Text } from "./text";
import { color, elevation, radius, space } from "./tokens";

/** "Good morning" by the resort's own clock. */
export function greetingAt(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function Hero({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  const { width } = useWindowDimensions();
  // the hills along the foot of the card, under the figures rather than
  // behind them; the sun has the top corner to itself
  const sceneW = Math.min(560, width - space.lg * 2);
  const sceneH = sceneW / 2;
  return (
    <View style={styles.card}>
      <View style={styles.glow} />
      <View style={styles.sunGlow} />
      <View style={styles.sun} />
      <ResortScene width={sceneW} height={sceneH} sky={false} sun={false} style={[styles.scene, { bottom: -sceneH * 0.12 }]} />
      <View style={[styles.body, { paddingBottom: sceneH * 0.55 }]}>
        <Text step="title" weight="bold" tone="onBrand" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {title}
        </Text>
        {subtitle ? (
          <Text step="small" weight="medium" tone="onBrand" numberOfLines={1} style={styles.soft}>
            {subtitle}
          </Text>
        ) : null}
        {children ? <View style={styles.figures}>{children}</View> : null}
      </View>
    </View>
  );
}

/** One figure on the greeting card. Its name is the figure read out whole. */
export function HeroFigure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.figure} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text step="caption" weight="medium" tone="onBrand" numberOfLines={1} style={styles.soft}>
        {label}
      </Text>
      <Text step="strong" weight="bold" tone="onBrand" tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      {sub ? (
        <Text step="caption" tone="onBrand" numberOfLines={1} style={styles.soft}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    borderRadius: radius.xl,
    backgroundColor: color.art.heroFrom,
    ...elevation.floating,
    shadowColor: color.art.heroFrom,
    shadowOpacity: 0.3,
  },
  glow: {
    position: "absolute",
    right: -80,
    top: -120,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: color.art.heroTo,
    opacity: 0.7,
  },
  scene: { position: "absolute", left: 0, opacity: 0.9 },
  sunGlow: { position: "absolute", right: 18, top: 14, width: 64, height: 64, borderRadius: 32, backgroundColor: color.art.sunGlow, opacity: 0.35 },
  sun: { position: "absolute", right: 34, top: 30, width: 32, height: 32, borderRadius: 16, backgroundColor: color.art.sun },
  body: { padding: space.lg, paddingRight: 84, gap: space.xs },
  soft: { opacity: 0.85 },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md, marginRight: -68 },
  figure: {
    flexGrow: 1,
    flexBasis: "45%",
    backgroundColor: color.art.frost,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
});
