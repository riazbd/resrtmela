/**
 * Every colour, size and gap the app is allowed to use.
 *
 * This is the only file in `src` permitted to write a colour or a type size;
 * `test/one-source-for-a-colour.spec.ts` walks the rest and fails on one. The
 * rule is not tidiness. Sixty-eight screens written by hand will otherwise
 * hold two hundred separate decisions, and a palette nobody can change in one
 * place is not a palette.
 *
 * The values are the console's own, because the phone and the desk are one
 * product and a resort's staff move between them during a shift. Where the
 * console leans on Tailwind's ramps, the hex codes are copied here rather
 * than approximated — a green that is nearly the brand green is worse than an
 * obviously different one.
 *
 * The register is the one the design chose: operational density. White
 * ground, tight information, thin rules, green only where it means something.
 * Resort staff scan numbers, and the screen should let them.
 */

/**
 * The brand ramp, from `apps/web/tailwind.config.ts`.
 *
 * 600 is the primary — the green on every button the console calls primary,
 * and the green of the app icon. The others exist so a tint and a pressed
 * state are chosen from the same family rather than computed on the spot.
 */
const brand = {
  50: "#f0fdf4",
  100: "#dcfce7",
  500: "#16a34a",
  600: "#15803d",
  700: "#166534",
  900: "#14532d",
} as const;

/**
 * The neutral ramp — Tailwind's slate, which is what the console's screens
 * are drawn in. Named `ink` rather than `grey` because these are the values
 * text, rules and grounds are chosen from, and "grey 400" says nothing about
 * whether it may be read.
 */
const ink = {
  0: "#ffffff",
  50: "#f8fafc",
  100: "#f1f5f9",
  200: "#e2e8f0",
  300: "#cbd5e1",
  400: "#94a3b8",
  500: "#64748b",
  600: "#475569",
  700: "#334155",
  800: "#1e293b",
  900: "#0f172a",
} as const;

/**
 * What a colour is *for*.
 *
 * A screen asks for `danger`, never for `red`. The difference shows the day
 * the palette moves: everything that meant "this is destructive" moves with
 * it, and everything that merely happened to be red does not.
 *
 * Each has a foreground for text and an icon, and a background for the quiet
 * block it sits in — which is how the console draws its own notices.
 */
const meaning = {
  ok: { fg: "#15803d", bg: "#f0fdf4", line: "#bbf7d0" },
  warn: { fg: "#b45309", bg: "#fffbeb", line: "#fde68a" },
  danger: { fg: "#b91c1c", bg: "#fef2f2", line: "#fecaca" },
  info: { fg: "#1d4ed8", bg: "#eff6ff", line: "#bfdbfe" },
} as const;

export const color = {
  brand,
  ink,
  ...meaning,

  /** The ground a screen is drawn on, and the card that sits on it. */
  screen: ink[50],
  surface: ink[0],
  /** A rule. Thin, because density is made of thin rules and not of boxes. */
  line: ink[200],

  /** Text, in the three weights of attention a dense screen needs. */
  title: ink[900],
  body: ink[700],
  muted: ink[500],
  /** Text on a brand or danger ground. */
  onBrand: ink[0],

  /** A control nobody may use. Never `muted`: unavailable is not quiet. */
  disabled: ink[300],
} as const;

/**
 * Space, on a four-point grid.
 *
 * Named by size rather than by use, because a gap between two rows and the
 * padding inside a card are the same distance and pretending otherwise
 * produces two scales that drift apart.
 */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  huge: 48,
} as const;

/**
 * The type scale. Nothing below twelve points.
 *
 * The console's phone stylesheet enforces the same floor, and for the same
 * reason: below twelve, a number on a counter read at arm's length in
 * daylight stops being a number.
 *
 * Line heights are carried with the sizes rather than computed, because a
 * figure wants a tight one and a paragraph wants a loose one, and a single
 * multiplier gets one of them wrong.
 */
export const text = {
  /** Column headings, timestamps, the unit beside a figure. */
  caption: { size: 12, line: 16 },
  /** Secondary rows, helper text under a field. */
  small: { size: 13, line: 18 },
  /** Everything a person actually reads. */
  body: { size: 15, line: 22 },
  /** A row's own title — a guest's name, a room's name. */
  strong: { size: 17, line: 24 },
  /** The heading of a section, and a screen's title in the bar. */
  title: { size: 20, line: 26 },
  /** One number that the screen exists to show. */
  figure: { size: 28, line: 34 },
} as const;

/** Corners. `pill` is deliberately larger than any control is tall. */
export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

/**
 * Elevation, kept to two steps and used sparingly.
 *
 * A dense screen separates things with rules and whitespace, not with
 * shadows. These exist for the two cases where something genuinely floats
 * above the page: a sheet, and a bar pinned over scrolling content.
 */
export const elevation = {
  raised: {
    shadowColor: ink[900],
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  floating: {
    shadowColor: ink[900],
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;

/**
 * The smallest a thing a finger has to hit may be.
 *
 * A constant and not a number inside `Button`, because a row, a tab, a
 * checkbox and a close button all owe the same debt to the same finger, and
 * only one of them is a button.
 */
export const TOUCH_TARGET = 44;

/**
 * How long anything takes to move.
 *
 * Two durations, because a screen that animates at five different speeds
 * reads as unfinished rather than as lively.
 */
export const duration = {
  quick: 120,
  settle: 240,
} as const;

export type TextStep = keyof typeof text;
export type SpaceStep = keyof typeof space;
