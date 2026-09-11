"use client";

import { useBrand } from "@/lib/brand-context";
import { DEFAULT_BRAND } from "@/lib/brand";
import { MARK_PATH, MARK_STROKE, WORDMARK_PATH, WORDMARK_VIEWBOX } from "./logo-paths";

/**
 * The logo — the owner's if they have set one, ours if they have not.
 *
 * Platform → Website CMS holds a name, a square icon and a wide logo. Whatever
 * is there wins here and in the browser tab, so a platform can be renamed and
 * re-skinned without a deploy.
 *
 * What ships as the fallback: a mark of two roofs meeting — the M of Mela, the
 * two sides this platform joins, and at a glance hills with a valley between
 * them. One stroke of one weight on a 32 grid, because a browser tab is
 * sixteen pixels and anything fussier dissolves there. The wordmark beside it
 * is Manrope ExtraBold in outlines (see `logo-paths.ts`), so it needs no font.
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
  const brand = useBrand();
  const onDark = tone === "onDark";

  if (brand.icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={brand.icon}
        width={size}
        height={size}
        alt={decorative ? "" : brand.name}
        className={`rounded-[22%] object-contain ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": brand.name })}
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

/** The name. The owner's wide logo if there is one, else their name, else ours in outlines. */
export function Wordmark({ height = 18, tone = "brand", className = "" }: { height?: number; tone?: Tone; className?: string }) {
  const brand = useBrand();
  const onDark = tone === "onDark";

  if (brand.logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={brand.logo} alt={brand.name} style={{ height }} className={`block w-auto ${className}`} />
    );
  }
  if (brand.name !== DEFAULT_BRAND.name) {
    // a renamed platform cannot use our outlines — they spell the old name
    return (
      <span
        className={`block font-extrabold leading-none tracking-tight ${onDark ? "text-white" : "text-brand-700"} ${className}`}
        style={{ fontSize: Math.round(height * 1.15) }}
      >
        {brand.name}
      </span>
    );
  }
  return (
    <svg height={height} viewBox={WORDMARK_VIEWBOX} className={`block ${className}`} role="img" aria-label={brand.name}>
      <path d={WORDMARK_PATH} fill={onDark ? "#fff" : INK} />
    </svg>
  );
}

/**
 * The lockup: mark, a fixed gap, the name — and an optional line under it
 * ("Admin Console", "Resort management platform"). An owner's wide logo
 * replaces the pair, since it already contains both.
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
  const brand = useBrand();
  const subLine = sub && (
    <span className={`mt-1 block text-[10px] ${tone === "onDark" ? "text-brand-200" : "text-slate-400"} ${subClassName}`}>
      {sub}
    </span>
  );

  if (brand.logo) {
    return (
      <span className={`flex items-center ${className}`}>
        <span>
          <Wordmark height={size * 0.75} tone={tone} />
          {subLine}
        </span>
      </span>
    );
  }

  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} tone={tone} decorative />
      <span>
        <Wordmark height={Math.round(size * 0.5)} tone={tone} />
        {subLine}
      </span>
    </span>
  );
}
