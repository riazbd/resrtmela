"use client";

/**
 * The front page's pictures — the product drawn the way it looks now, with
 * its colours, charts and the resort scene, rather than grey boxes of text.
 *
 * The owner, 2026-10-03: the console and the app had been redrawn and the
 * front door had not — "landing page ba home page ta ekdom e dhoro nai". These
 * are illustrations, so the names and figures in them are examples, the way
 * the old mock-ups were.
 */
import type { ComponentType, ReactNode } from "react";
import { BedDouble, Bell, CalendarDays, HandCoins, TrendingUp, UtensilsCrossed } from "lucide-react";
import { ResortScene } from "@/components/art";

/** An icon in a soft gradient circle — the page's one way of marking a thing. */
export function IconBubble({ icon: Icon, tone = "emerald", size = "md" }: { icon: ComponentType<{ className?: string }>; tone?: Tone; size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "h-14 w-14" : size === "sm" ? "h-9 w-9" : "h-11 w-11";
  const glyph = size === "lg" ? "h-7 w-7" : size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-sm ${TONES[tone]} ${box}`}>
      <Icon className={`${glyph} text-white`} />
    </span>
  );
}

export type Tone = "emerald" | "sky" | "amber" | "violet" | "rose" | "teal";
const TONES: Record<Tone, string> = {
  emerald: "from-emerald-400 to-emerald-600 shadow-emerald-600/30",
  sky: "from-sky-400 to-blue-600 shadow-blue-600/30",
  amber: "from-amber-300 to-orange-500 shadow-orange-500/30",
  violet: "from-violet-400 to-purple-600 shadow-purple-600/30",
  rose: "from-rose-400 to-pink-600 shadow-pink-600/30",
  teal: "from-teal-300 to-cyan-600 shadow-cyan-600/30",
};

/** The hero's ground: deep green, a sun, the hills along the foot. */
export function HeroGround({ children }: { children: ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-600 text-white">
      <div aria-hidden className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-emerald-400/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute right-[8%] top-16 hidden h-40 w-40 rounded-full bg-amber-300/40 blur-2xl sm:block" />
      <div aria-hidden className="pointer-events-none absolute right-[11%] top-24 hidden h-16 w-16 rounded-full bg-amber-300/90 sm:block" />
      {[
        "left-[12%] top-24",
        "left-[46%] top-12",
        "left-[62%] top-36",
        "left-[30%] top-[22rem]",
      ].map((p) => (
        <span key={p} aria-hidden className={`pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-white/50 ${p}`} />
      ))}
      <ResortScene sky={false} className="pointer-events-none absolute inset-x-0 bottom-0 h-36 w-full opacity-50 sm:h-44 [mask-image:linear-gradient(to_bottom,transparent,black_45%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent" />
      <div className="relative">{children}</div>
    </section>
  );
}

/** The product on a laptop and a phone, with two notes floating over them. */
export function HeroDevices() {
  return (
    <div className="relative mx-auto w-full max-w-xl">
      {/* the laptop: the dashboard */}
      <div className="rounded-[1.6rem] bg-slate-900/80 p-2 shadow-2xl shadow-emerald-950/50 ring-1 ring-white/10">
        <div className="overflow-hidden rounded-[1.2rem] bg-slate-50">
          <div className="flex items-center gap-1.5 bg-white px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span className="ml-3 text-[11px] font-semibold text-slate-400">Dashboard · Today</span>
          </div>
          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-700 to-teal-600 px-4 py-3 text-white">
            <ResortScene sky={false} className="pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full opacity-40" />
            <div className="relative text-sm font-extrabold">Good morning, Karim</div>
            <div className="relative mt-2 grid grid-cols-3 gap-2">
              {[
                ["Occupied", "82%"],
                ["Arriving", "6"],
                ["Collected", "৳48,200"],
              ].map(([l, v]) => (
                <div key={l} className="rounded-xl bg-emerald-950/25 px-2.5 py-1.5 ring-1 ring-white/15">
                  <div className="text-[9px] font-bold uppercase tracking-wide text-emerald-50/80">{l}</div>
                  <div className="text-sm font-black">{v}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[1.5fr_1fr] gap-3 p-3">
            <div className="rounded-xl bg-white p-3 shadow-sm">
              <div className="text-[10px] font-bold text-slate-500">The last 30 days</div>
              <AreaArt />
            </div>
            <div className="flex flex-col items-center justify-center rounded-xl bg-white p-3 shadow-sm">
              <RingArt />
              <div className="mt-1 text-[10px] font-semibold text-slate-500">rooms tonight</div>
            </div>
          </div>
        </div>
      </div>

      {/* the phone: the day sheet */}
      <div className="absolute -bottom-10 -right-2 hidden w-40 rounded-[1.6rem] bg-slate-900 p-1.5 shadow-2xl shadow-emerald-950/60 sm:block lg:-right-8">
        <div className="overflow-hidden rounded-[1.25rem] bg-white">
          <div className="bg-emerald-700 px-3 py-2 text-[10px] font-bold text-white">The floor</div>
          <div className="grid grid-cols-3 gap-1 p-2">
            {["101", "102", "103", "104", "105", "106", "107", "108", "109"].map((r, i) => {
              const t = i % 4 === 0 ? "bg-rose-100 text-rose-700" : i % 3 === 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700";
              return (
                <div key={r} className={`rounded-lg py-1.5 text-center text-[10px] font-black ${t}`}>
                  {r}
                </div>
              );
            })}
          </div>
          <div className="px-2 pb-3">
            <div className="flex h-2 overflow-hidden rounded-full">
              <span className="w-[55%] bg-emerald-500" />
              <span className="w-[25%] bg-amber-400" />
              <span className="w-[20%] bg-rose-500" />
            </div>
          </div>
        </div>
      </div>

      {/* the notes */}
      <Note className="-left-4 -top-6 hidden sm:flex lg:-left-12" icon={Bell} tone="violet" title="New booking · BK-00095" sub="Agent Rikan · Lunaria · 2 nights" />
      <Note className="-bottom-6 left-6 flex" icon={HandCoins} tone="amber" title="৳12,500 received" sub="bKash · Tahmina Khatun" />
    </div>
  );
}

function Note({ className, icon, tone, title, sub }: { className: string; icon: ComponentType<{ className?: string }>; tone: Tone; title: string; sub: string }) {
  return (
    <div className={`absolute items-center gap-2.5 rounded-2xl bg-white px-3.5 py-2.5 text-slate-800 shadow-xl shadow-emerald-950/20 ${className}`}>
      <IconBubble icon={icon} tone={tone} size="sm" />
      <div>
        <div className="text-[11px] font-bold">{title}</div>
        <div className="text-[10px] text-slate-400">{sub}</div>
      </div>
    </div>
  );
}

/** A small area chart: rooms rising over a month, the restaurant under it. */
function AreaArt() {
  const rooms = [18, 22, 20, 28, 26, 34, 30, 38, 36, 44, 40, 48];
  const food = [6, 8, 7, 10, 9, 12, 11, 13, 12, 15, 14, 16];
  const path = (v: number[]) => v.map((n, i) => `${i === 0 ? "M" : "L"}${(i / (v.length - 1)) * 200} ${60 - n}`).join(" ");
  return (
    <svg viewBox="0 0 200 64" className="mt-1 h-20 w-full" aria-hidden>
      <defs>
        <linearGradient id="home-area-rooms" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#16a34a" stopOpacity="0.35" />
          <stop offset="1" stopColor="#16a34a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path(rooms)} L200 64 L0 64Z`} fill="url(#home-area-rooms)" />
      <path d={path(rooms)} fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d={path(food)} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A ring: how full the house is tonight. */
function RingArt({ pct = 82 }: { pct?: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 70 70" className="h-20 w-20" aria-hidden>
      <circle cx="35" cy="35" r={r} fill="none" stroke="#dcfce7" strokeWidth="9" />
      <circle cx="35" cy="35" r={r} fill="none" stroke="#16a34a" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 35 35)" />
      <text x="35" y="39" textAnchor="middle" className="fill-slate-900 text-[13px] font-black">
        {pct}%
      </text>
    </svg>
  );
}

/** The frame every feature picture sits in: a soft coloured plate and a card. */
function Plate({ tone, children }: { tone: "emerald" | "sky" | "amber"; children: ReactNode }) {
  const plate = tone === "sky" ? "from-sky-100 to-indigo-50" : tone === "amber" ? "from-amber-100 to-rose-50" : "from-emerald-100 to-teal-50";
  return (
    <div className="relative">
      <div aria-hidden className={`absolute inset-0 rounded-[2rem] bg-gradient-to-br ${plate} sm:-inset-5`} />
      <div aria-hidden className="absolute -right-3 -top-3 hidden h-20 w-20 rounded-full bg-white/60 sm:block" />
      <div className="relative overflow-hidden rounded-2xl bg-white shadow-xl shadow-slate-900/10 ring-1 ring-slate-200/70">{children}</div>
    </div>
  );
}

function Bar({ title, icon, tone }: { title: string; icon: ComponentType<{ className?: string }>; tone: Tone }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
      <IconBubble icon={icon} tone={tone} size="sm" />
      <span className="text-xs font-bold text-slate-700">{title}</span>
      <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">LIVE</span>
    </div>
  );
}

/** The calendar: rooms down, nights across, stays as coloured bars, how full on top. */
export function MockCalendar() {
  const days = [3, 4, 5, 6, 7, 8, 9];
  const sold = [6, 7, 5, 8, 9, 10, 7];
  const rows: { room: string; stays: [number, number, string, string][] }[] = [
    { room: "Camellia", stays: [[0, 2, "Raju", "bg-emerald-200 text-emerald-900"], [3, 3, "Mitu", "bg-sky-200 text-sky-900"]] },
    { room: "Lunaria", stays: [[1, 3, "Shakil", "bg-amber-200 text-amber-900"], [5, 2, "Rina", "bg-emerald-200 text-emerald-900"]] },
    { room: "Snow Drop", stays: [[0, 1, "Kazi", "bg-violet-200 text-violet-900"], [2, 4, "Tania", "bg-sky-200 text-sky-900"]] },
    { room: "Lavender", stays: [[4, 3, "Imran", "bg-rose-200 text-rose-900"]] },
  ];
  return (
    <Plate tone="emerald">
      <Bar title="Calendar · October" icon={CalendarDays} tone="emerald" />
      <div className="p-4">
        <div className="grid grid-cols-[4.5rem_repeat(7,1fr)] items-end gap-1">
          <span />
          {sold.map((n, i) => (
            <div key={i} className="flex h-12 flex-col justify-end rounded-md bg-emerald-50">
              <div className="rounded-md bg-gradient-to-t from-emerald-500 to-emerald-400" style={{ height: `${n * 10}%` }} />
            </div>
          ))}
          <span />
          {days.map((d) => (
            <div key={d} className={`py-1 text-center text-[10px] font-bold ${d === 3 ? "rounded-md bg-emerald-600 text-white" : "text-slate-400"}`}>
              {d}
            </div>
          ))}
        </div>
        <div className="mt-2 space-y-1.5">
          {rows.map((r) => (
            <div key={r.room} className="grid grid-cols-[4.5rem_repeat(7,1fr)] gap-1">
              <div className="truncate py-1.5 text-[10px] font-semibold text-slate-600">{r.room}</div>
              {days.map((_, i) => {
                const stay = r.stays.find(([from]) => from === i);
                const inside = r.stays.some(([from, n]) => i > from && i < from + n);
                if (inside) return null;
                if (stay) {
                  return (
                    <div key={i} className={`truncate rounded-md px-1.5 py-1.5 text-[10px] font-bold ${stay[3]}`} style={{ gridColumn: `span ${stay[1]}` }}>
                      {stay[2]}
                    </div>
                  );
                }
                return <div key={i} className="rounded-md bg-emerald-50 ring-1 ring-inset ring-emerald-100" />;
              })}
            </div>
          ))}
        </div>
      </div>
    </Plate>
  );
}

/** A booking: who, the nights as a strip, the bill by what it is made of. */
export function MockFrontDesk() {
  return (
    <Plate tone="sky">
      <Bar title="Booking · BK-00095" icon={BedDouble} tone="sky" />
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-sm font-black text-white">K</span>
          <div>
            <div className="text-sm font-bold text-slate-900">Kazi Abir</div>
            <div className="text-[11px] text-slate-400">Lunaria · 2 adults · via Agent Rikan</div>
          </div>
          <span className="ml-auto rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">Checked-in</span>
        </div>
        <div className="flex gap-1.5">
          {[
            ["Fri", 3, "bg-slate-100 text-slate-500"],
            ["Sat", 4, "bg-blue-100 text-blue-700"],
            ["Sun", 5, "bg-emerald-100 text-emerald-700"],
            ["Mon", 6, "bg-emerald-100 text-emerald-700"],
          ].map(([w, d, t]) => (
            <div key={String(d)} className={`w-12 rounded-xl py-1.5 text-center ${t}`}>
              <div className="text-[9px] font-bold uppercase">{w}</div>
              <div className="text-sm font-black">{d}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">What the bill is made of</div>
          <div className="flex h-3 overflow-hidden rounded-full">
            <span className="w-[70%] bg-emerald-500" />
            <span className="w-[15%] bg-blue-500" />
            <span className="w-[15%] bg-amber-400" />
          </div>
          <div className="mt-1.5 flex gap-3 text-[10px] text-slate-500">
            <span>● Rooms ৳9,000</span>
            <span>● Extra ৳1,800</span>
            <span>● Tax ৳1,700</span>
          </div>
        </div>
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">How much is paid</div>
          <div className="flex h-3 overflow-hidden rounded-full bg-rose-100">
            <span className="w-[60%] bg-emerald-500" />
          </div>
          <div className="mt-1.5 text-[10px] text-slate-500">৳7,500 in · ৳5,000 to come</div>
        </div>
      </div>
    </Plate>
  );
}

/** The restaurant: a ticket, room or walk-in, what sells. */
export function MockRestaurant() {
  return (
    <Plate tone="amber">
      <Bar title="Restaurant · Today" icon={UtensilsCrossed} tone="amber" />
      <div className="grid gap-4 p-4 sm:grid-cols-[1.2fr_1fr]">
        <div className="space-y-1.5 text-[11px]">
          {[
            ["Lunch buffet × 2", "৳1,200"],
            ["Grilled Rui × 1", "৳450"],
            ["Cold coffee × 3", "৳360"],
          ].map(([i, p]) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-slate-600">{i}</span>
              <span className="font-semibold text-slate-800">{p}</span>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-2.5 font-bold text-white">
            <span>On room 104</span>
            <span>৳2,010</span>
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">What sells</div>
          {[
            ["Buffet", 90, "bg-orange-500"],
            ["Fish", 62, "bg-amber-400"],
            ["Coffee", 45, "bg-rose-400"],
            ["BBQ", 30, "bg-violet-400"],
          ].map(([l, w, c]) => (
            <div key={String(l)}>
              <div className="flex justify-between text-[10px] text-slate-600">
                <span>{l}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div className={`h-2 rounded-full ${c}`} style={{ width: `${w}%` }} />
              </div>
            </div>
          ))}
          <div className="flex items-center gap-1.5 pt-1 text-[10px] font-semibold text-emerald-700">
            <TrendingUp className="h-3.5 w-3.5" /> 18% up on last week
          </div>
        </div>
      </div>
    </Plate>
  );
}
