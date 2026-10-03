"use client";

/**
 * The console's pictures: a resort at the foot of the hills — sun, ridges,
 * a lake, two cottages and the trees around them.
 *
 * The owner, 2026-10-02: the console and the app should be so good to look
 * at that people use them because they want to — "art, color, figure". This
 * is the art. One scene, drawn once, in the brand's greens with a warm sun,
 * used large behind the dashboard's greeting and small wherever a screen has
 * nothing to show yet, so an empty list reads as a quiet morning rather than
 * as a missing page.
 */

import { useId } from "react";

export function ResortScene({ className = "", tone = "day", sky: withSky = true }: { className?: string; tone?: "day" | "dusk"; /** off where the scene sits on its own colour, as on the hero */ sky?: boolean }) {
  const id = useId().replace(/:/g, "");
  const sky = tone === "day" ? ["#ecfdf5", "#d1fae5"] : ["#fff7ed", "#fde68a"];
  return (
    <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMax slice" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="1" stopColor={sky[1]} />
        </linearGradient>
        <radialGradient id={`${id}-sun`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fde047" />
          <stop offset="0.6" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-far`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#6ee7b7" />
          <stop offset="1" stopColor="#34d399" />
        </linearGradient>
        <linearGradient id={`${id}-near`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#10b981" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
        <linearGradient id={`${id}-lake`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#5eead4" />
          <stop offset="1" stopColor="#0d9488" />
        </linearGradient>
      </defs>
      {withSky && <rect width="400" height="200" fill={`url(#${id}-sky)`} />}
      <circle cx="300" cy="70" r="46" fill={`url(#${id}-sun)`} opacity="0.55" />
      <circle cx="300" cy="70" r="22" fill="#fbbf24" />
      {/* birds */}
      <path d="M90 48 q6 -6 12 0 q6 -6 12 0" fill="none" stroke="#065f46" strokeWidth="1.6" strokeLinecap="round" opacity="0.5" />
      <path d="M130 34 q4 -4 8 0 q4 -4 8 0" fill="none" stroke="#065f46" strokeWidth="1.4" strokeLinecap="round" opacity="0.4" />
      {/* far ridge */}
      <path d="M0 120 C60 80 110 95 160 105 C210 115 250 70 310 85 C350 95 380 90 400 98 L400 200 L0 200Z" fill={`url(#${id}-far)`} opacity="0.9" />
      {/* near hill */}
      <path d="M0 150 C70 118 140 128 200 140 C260 152 330 120 400 132 L400 200 L0 200Z" fill={`url(#${id}-near)`} />
      {/* lake */}
      <path d="M150 172 C200 160 290 162 340 172 C300 186 200 188 150 172Z" fill={`url(#${id}-lake)`} />
      <path d="M190 172 h30 M245 176 h26 M210 180 h20" stroke="#ccfbf1" strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
      {/* cottages */}
      <g>
        <rect x="74" y="136" width="26" height="18" rx="2" fill="#fef3c7" />
        <path d="M70 138 L87 124 L104 138Z" fill="#b45309" />
        <rect x="84" y="144" width="6" height="10" fill="#92400e" />
        <rect x="112" y="142" width="20" height="14" rx="2" fill="#fef3c7" />
        <path d="M109 144 L122 133 L135 144Z" fill="#c2410c" />
      </g>
      {/* trees */}
      {[
        [40, 140, 1],
        [56, 146, 0.8],
        [150, 146, 0.9],
        [360, 128, 1.1],
        [378, 134, 0.8],
      ].map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          <rect x="-1.5" y="0" width="3" height="10" fill="#064e3b" />
          <path d="M0 -18 L9 2 L-9 2Z" fill="#065f46" />
          <path d="M0 -26 L7 -8 L-7 -8Z" fill="#047857" />
        </g>
      ))}
    </svg>
  );
}

/**
 * A small picture for a list with nothing in it yet — the scene as a round
 * medallion in soft rings, not a thumbnail in a box. The box read as a
 * placeholder image that had failed to load.
 */
export function EmptyArt({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`relative mx-auto flex h-36 w-36 items-center justify-center ${className}`}>
      <div className="absolute inset-0 rounded-full bg-gradient-to-b from-emerald-50 to-teal-50/40" />
      <div className="absolute inset-3 rounded-full bg-emerald-100/50" />
      <div className="relative h-24 w-24 overflow-hidden rounded-full shadow-lg shadow-emerald-900/10 ring-4 ring-white">
        <ResortScene className="h-full w-full" />
      </div>
      <span className="absolute left-3 top-6 h-2 w-2 rounded-full bg-amber-300" />
      <span className="absolute right-4 top-3 h-1.5 w-1.5 rounded-full bg-emerald-300" />
      <span className="absolute bottom-5 right-2 h-2.5 w-2.5 rounded-full bg-teal-200" />
      <span className="absolute bottom-3 left-6 h-1.5 w-1.5 rounded-full bg-sky-200" />
    </div>
  );
}

/**
 * The sun and the hills behind a green page — the sign-in, sign-up and
 * download pages wear the front page's scene, so the door and the house match.
 * Drop it as the first child of a `relative overflow-hidden` block.
 */
export function SceneBackdrop({ height = "h-56" }: { height?: string }) {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute right-[10%] top-12 h-36 w-36 rounded-full bg-amber-300/30 blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute right-[13%] top-20 h-14 w-14 rounded-full bg-amber-300/90" />
      <ResortScene sky={false} className={`pointer-events-none absolute inset-x-0 bottom-0 w-full opacity-60 [mask-image:linear-gradient(to_bottom,transparent,black_45%)] ${height}`} />
    </>
  );
}
