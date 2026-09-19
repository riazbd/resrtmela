/**
 * The only way text is drawn.
 *
 * React Native's own `Text` takes a `fontSize`, and a screen that sets one
 * has left the scale. This takes a step by name instead, so "what size is a
 * row's title" has one answer across sixty-eight screens rather than sixty-
 * eight.
 */
import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { color, text as scale, type TextStep } from "./tokens";

/** The size and line height of one step of the scale, as a style. */
export function step(name: TextStep): TextStyle {
  return { fontSize: scale[name].size, lineHeight: scale[name].line };
}

/** Which of the three weights of attention a dense screen has. */
export type TextTone = "title" | "body" | "muted" | "onBrand" | "danger" | "ok" | "warn";

const toneColor: Record<TextTone, string> = {
  title: color.title,
  body: color.body,
  muted: color.muted,
  onBrand: color.onBrand,
  danger: color.danger.fg,
  ok: color.ok.fg,
  warn: color.warn.fg,
};

export interface OwnTextProps extends TextProps {
  step?: TextStep;
  tone?: TextTone;
  /** 600 for a row's own title, 700 for a figure. Named so a screen need not know. */
  weight?: "regular" | "medium" | "bold";
  /** Money and counts, so a column of them lines up. */
  tabular?: boolean;
}

const weights = { regular: "400", medium: "600", bold: "700" } as const;

/**
 * A phone's font-size setting is an accessibility need, not a preference, so
 * text grows with it — but an operational screen full of columns falls apart
 * somewhere past 1.4, and a day sheet that cannot be read at all is not an
 * accessible day sheet. The cap is a compromise the design makes on purpose,
 * and a screen may raise it for a heading that has room.
 */
export const MAX_FONT_SCALE = 1.4;

export function Text({
  step: name = "body",
  tone = "body",
  weight = "regular",
  tabular = false,
  style,
  ...props
}: OwnTextProps) {
  return (
    <RNText
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      {...props}
      style={[
        step(name),
        { color: toneColor[tone], fontWeight: weights[weight] },
        tabular ? { fontVariant: ["tabular-nums" as const] } : null,
        style,
      ]}
    />
  );
}
