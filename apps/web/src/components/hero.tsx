"use client";

/**
 * The top of the dashboard: who you are, where, what day — over the resort
 * scene. The first thing anybody sees on signing in, so it is the one place
 * the console is allowed to be a picture before it is a tool.
 */

import type { ReactNode } from "react";
import { ResortScene } from "@/components/art";

/** "Good morning" by the resort's own clock, not the browser's. */
export function greetingAt(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function Hero({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  /** the figures that sit on the scene */
  children?: ReactNode;
}) {
  return (
    <section className="rm-card relative overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 text-white">
      {/* no sky of its own: a pale sky behind white words is how the
          greeting vanished on a phone. The hills sit at the foot instead. */}
      <ResortScene sky={false} className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] w-full opacity-40 sm:inset-x-auto sm:right-0 sm:h-full sm:w-[55%] sm:opacity-70 sm:[mask-image:linear-gradient(to_left,black_55%,transparent)]" />
      <div aria-hidden className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
      <div className="relative px-6 py-6 sm:px-8 sm:py-7">
        <h1 className="text-2xl font-extrabold tracking-tight drop-shadow-sm sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm font-medium text-emerald-50/90">{subtitle}</p>}
        {children && <div className="mt-5 flex flex-wrap gap-3">{children}</div>}
      </div>
    </section>
  );
}

/** A figure on the scene: frosted glass, so the picture shows through. */
export function HeroFigure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-[8.5rem] flex-1 rounded-2xl bg-emerald-950/25 px-4 py-2.5 ring-1 ring-inset ring-white/20 backdrop-blur-md sm:flex-none">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-50/90">{label}</div>
      <div className="text-xl font-extrabold tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-emerald-50/80">{hint}</div>}
    </div>
  );
}
