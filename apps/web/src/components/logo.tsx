import { MARK_PATH, MARK_STROKE, WORDMARK_PATH, WORDMARK_VIEWBOX } from "./logo-paths";

/**
 * Resort Mela's logo.
 *
 * The mark is two roofs meeting: the M of Mela, the two sides this platform
 * joins — a resort and the agency selling it — and, at a glance, hills with a
 * valley between them. It is one stroke of one weight on a 32 grid, because
 * most of the places a logo is really seen are small: a browser tab is sixteen
 * pixels, and anything fussier than this dissolves there.
 *
 * Both the mark and the wordmark are paths (see `logo-paths.ts`). Nothing here
 * waits on a web font, and the logo is the same shape everywhere it appears.
 */

type Tone = "brand" | "onDark";

const INK = "#15803d";

export function LogoMark({
  size = 32,
  tone = "brand",
  tile = true,
  decorative = false,
  className = "",
}: {
  size?: number;
  tone?: Tone;
  /** the rounded tile behind the mark — off for a bare mark on its own */
  tile?: boolean;
  /** true when a wordmark beside it already names the brand to a screen reader */
  decorative?: boolean;
  className?: string;
}) {
  const onDark = tone === "onDark";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": "Resort Mela" })}
    >
      {tile && <rect width="32" height="32" rx="7.5" fill={onDark ? "rgba(255,255,255,0.13)" : INK} />}
      <path
        d={MARK_PATH}
        fill="none"
        stroke={tile || onDark ? "#fff" : INK}
        strokeWidth={MARK_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The name, as outlines. `height` is the cap height of the letters, in pixels. */
export function Wordmark({ height = 18, tone = "brand", className = "" }: { height?: number; tone?: Tone; className?: string }) {
  return (
    <svg
      height={height}
      viewBox={WORDMARK_VIEWBOX}
      className={`block ${className}`}
      role="img"
      aria-label="Resort Mela"
    >
      <path d={WORDMARK_PATH} fill={tone === "onDark" ? "#fff" : INK} />
    </svg>
  );
}

/**
 * The lockup: mark, a fixed gap, the name — and an optional line under it
 * ("Admin Console", "Resort management platform").
 */
export function Logo({
  size = 36,
  tone = "brand",
  sub,
  className = "",
  subClassName = "",
}: {
  size?: number;
  tone?: Tone;
  sub?: string;
  className?: string;
  subClassName?: string;
}) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} tone={tone} decorative />
      <span>
        <Wordmark height={Math.round(size * 0.5)} tone={tone} />
        {sub && (
          <span className={`mt-1 block text-[10px] ${tone === "onDark" ? "text-brand-200" : "text-slate-400"} ${subClassName}`}>
            {sub}
          </span>
        )}
      </span>
    </span>
  );
}
