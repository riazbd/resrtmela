/**
 * The app's picture: a resort at the foot of the hills — sun, two ridges, a
 * lake, two cottages, a few trees.
 *
 * The owner, 2026-10-02, wanted the app good enough to look at that people
 * use it because they want to: "art, color, figure". This is the console's
 * scene (`apps/web/src/components/art.tsx`) drawn with views — circles for
 * the sun and the hills, border triangles for roofs and trees — because an
 * SVG library is native code, and native code is a new install on every
 * phone where this arrives with the next update.
 *
 * Used large behind the dashboard's greeting and small wherever a list has
 * nothing in it yet.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { color } from "./tokens";

const a = color.art;

/** A triangle pointing up, from borders: a roof or a tree. */
function Peak({ x, y, w, h, fill }: { x: number; y: number; w: number; h: number; fill: string }) {
  return (
    <View
      style={{
        position: "absolute",
        left: x - w / 2,
        top: y - h,
        width: 0,
        height: 0,
        borderLeftWidth: w / 2,
        borderRightWidth: w / 2,
        borderBottomWidth: h,
        borderLeftColor: "transparent",
        borderRightColor: "transparent",
        borderBottomColor: fill,
      }}
    />
  );
}

/**
 * The scene at a given size. Everything is placed in a 200 × 100 frame and
 * scaled, so it reads the same at 150 points wide and at 400.
 */
export function ResortScene({
  width,
  height,
  style,
  sky = true,
  sun = true,
}: {
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
  sky?: boolean;
  /** off where the sun is drawn somewhere else — the greeting card has its own */
  sun?: boolean;
}) {
  const k = width / 200;
  const s = (n: number) => n * k;
  const tree = (x: number, y: number, size = 1) => (
    <View key={`${x}-${y}`}>
      <View style={{ position: "absolute", left: s(x) - s(1), top: s(y), width: s(2), height: s(5 * size), backgroundColor: a.tree }} />
      <Peak x={s(x)} y={s(y + 1)} w={s(10 * size)} h={s(11 * size)} fill={a.tree} />
      <Peak x={s(x)} y={s(y - 5 * size)} w={s(8 * size)} h={s(9 * size)} fill={a.hillDeep} />
    </View>
  );
  return (
    <View style={[{ width, height, overflow: "hidden", backgroundColor: sky ? a.sky : "transparent" }, style]} pointerEvents="none">
      {sky ? <View style={[StyleSheet.absoluteFill, { top: height * 0.45, backgroundColor: a.skyLow }]} /> : null}
      {/* the sun and its glow */}
      {sun ? (
        <>
          <View style={{ position: "absolute", left: s(140), top: s(14), width: s(40), height: s(40), borderRadius: s(20), backgroundColor: a.sunGlow, opacity: 0.6 }} />
          <View style={{ position: "absolute", left: s(150), top: s(24), width: s(20), height: s(20), borderRadius: s(10), backgroundColor: a.sun }} />
        </>
      ) : null}
      {/* the far ridge, then the near hill: two great circles, most of each below the frame */}
      <View style={{ position: "absolute", left: s(-60), top: s(48), width: s(200), height: s(200), borderRadius: s(100), backgroundColor: a.hillFar }} />
      <View style={{ position: "absolute", left: s(90), top: s(40), width: s(220), height: s(220), borderRadius: s(110), backgroundColor: a.hillFar, opacity: 0.85 }} />
      <View style={{ position: "absolute", left: s(-40), top: s(70), width: s(300), height: s(300), borderRadius: s(150), backgroundColor: a.hillNear }} />
      {/* the lake */}
      <View style={{ position: "absolute", left: s(86), top: s(84), width: s(80), height: s(10), borderRadius: s(6), backgroundColor: a.lake }} />
      {/* two cottages */}
      <View style={{ position: "absolute", left: s(36), top: s(70), width: s(14), height: s(9), backgroundColor: a.wall, borderRadius: s(1) }} />
      <Peak x={s(43)} y={s(71)} w={s(18)} h={s(8)} fill={a.roof} />
      <View style={{ position: "absolute", left: s(56), top: s(73), width: s(10), height: s(7), backgroundColor: a.wall, borderRadius: s(1) }} />
      <Peak x={s(61)} y={s(74)} w={s(13)} h={s(6)} fill={a.roof} />
      {tree(20, 68)}
      {tree(78, 72, 0.8)}
      {tree(180, 60, 1.1)}
      {tree(192, 64, 0.8)}
    </View>
  );
}
