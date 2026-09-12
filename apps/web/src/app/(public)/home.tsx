"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatMoney, planFeatureLabel } from "@rh/shared";
import { Logo } from "@/components/logo";
import type { PublicPlan } from "./plan";
import type { HomeData } from "./home-data";
import {
  CalendarDays,
  BedDouble,
  UtensilsCrossed,
  Wallet,
  Users,
  BarChart3,
  ArrowRight,
  Check,
  Star,
  Smartphone,
  FileText,
  ShieldCheck,
  ChevronDown,
  Menu,
  X,
  Bell,
  Receipt,
  TrendingUp,
  MessageSquare,
} from "lucide-react";

/**
 * The four figures under the hero.
 *
 * They used to read "89+ bookings managed", "৳1M+ revenue tracked", "10+ rooms
 * per resort" and "99.9% uptime". The first three were the demo database's
 * numbers and the fourth was nobody's: no uptime was ever measured, so the page
 * was making a reliability promise on the strength of a round number that
 * looked good.
 *
 * These defaults are claims that are true and can be shown to be true — a room
 * cannot be sold twice because a unique index forbids it, and the revenue
 * figures were checked cell by cell against a manager's own register. They are
 * CMS keys like the rest of the homepage, so the platform can change them
 * without a deploy, which is what stopped the old ones being fixed.
 */
const STAT_KEYS = ["stats.1", "stats.2", "stats.3", "stats.4"] as const;

/**
 * Three of these are claims the owner writes; the fourth is a fact the plan
 * already holds. `stats.4` therefore has no number of its own — `trialFor`
 * fills it from the plan list, so changing the trial in Platform → Plans
 * changes the homepage with it. A CMS row still overrides any of them, but a
 * *default* that contradicts the plan nobody edited is how one page comes to
 * promise two different trials.
 */
const STAT_FALLBACKS: Record<string, { n: string; l: string }> = {
  "stats.1": { n: "0", l: "Double bookings possible" },
  "stats.2": { n: "98.9%", l: "Match to a manager's own register" },
  "stats.3": { n: "2", l: "Languages, on every screen" },
  "stats.4": { n: "", l: "Free, no card" },
};

/** The trial, in the words the page uses for it. Empty when the plans disagree. */
function trialFor(days: number): string {
  return days ? `${days} days` : "Free";
}

function MockDaySheet() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
        <div className="text-xs font-bold text-slate-700">Day Sheet · Today</div>
        <div className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">LIVE</div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 p-3">
        {[
          { r: "Camellia", g: "Raju · arrives 12 PM", s: "in" },
          { r: "Lunaria", g: "shakil · staying", s: "stay" },
          { r: "Snow Drop", g: "available", s: "free" },
          { r: "Cherry Blossom", g: "local · staying", s: "stay" },
          { r: "Margarita", g: "maliha · checkout", s: "out" },
          { r: "Lavender", g: "available", s: "free" },
        ].map((c) => (
          <div
            key={c.r}
            className={`rounded-lg border px-2.5 py-2 text-[11px] ${
              c.s === "free"
                ? "border-dashed border-slate-200 text-slate-400"
                : c.s === "in"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : c.s === "out"
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-sky-200 bg-sky-50 text-sky-800"
            }`}
          >
            <div className="font-bold">{c.r}</div>
            <div className="truncate opacity-75">{c.g}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-slate-100 p-3">
        {[
          { l: "Arrivals", v: "6", c: "text-emerald-600" },
          { l: "In-house", v: "14", c: "text-sky-600" },
          { l: "Dues", v: "৳48,200", c: "text-amber-600" },
        ].map((s) => (
          <div key={s.l} className="rounded-lg bg-slate-50 p-2.5 text-center">
            <div className={`text-base font-black ${s.c}`}>{s.v}</div>
            <div className="text-[10px] text-slate-400">{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockBooking() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700">New booking · BK-00095</div>
      <div className="space-y-2 p-4 text-[11px]">
        <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
          <span className="text-slate-400">Guest</span><span className="font-semibold text-slate-700">Kazi Abir</span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
          <span className="text-slate-400">Room</span><span className="font-semibold text-slate-700">Lunaria · 2 nights</span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
          <span className="text-emerald-600">Advance</span><span className="font-bold text-emerald-700">৳1,000 paid</span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
          <span className="text-slate-400">Source</span><span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">AGENT · Rikan</span>
        </div>
      </div>
    </div>
  );
}

function MockPos() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700">Restaurant · Table order</div>
      <div className="space-y-1.5 p-4 text-[11px]">
        {[
          { i: "Lunch buffet", q: 2, p: "৳1,200" },
          { i: "Grilled Rui", q: 1, p: "৳450" },
          { i: "Cold coffee", q: 3, p: "৳360" },
        ].map((it) => (
          <div key={it.i} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
            <span className="text-slate-600">{it.i} × {it.q}</span>
            <span className="font-semibold text-slate-700">{it.p}</span>
          </div>
        ))}
        <div className="flex items-center justify-between rounded-lg bg-brand-600 px-3 py-2.5 font-bold text-white">
          <span>Bill total</span><span>৳2,010 · cash</span>
        </div>
      </div>
    </div>
  );
}

/** One row of the platform's price list, as `/cms/plans` sends it. */
/**
 * How many columns the price list needs.
 *
 * It was `lg:grid-cols-3`, written when there were three plans and no way to
 * make a fourth. The owner can make a fourth now, and it dropped onto a row of
 * its own, alone and left-aligned, next to two card-widths of nothing.
 *
 * Tailwind reads class names out of the source, so these have to be written
 * out rather than built from the number.
 */
function pricingColumns(count: number): string {
  if (count <= 1) return "mx-auto max-w-sm";
  if (count === 2) return "mx-auto max-w-3xl sm:grid-cols-2";
  if (count === 4) return "sm:grid-cols-2 xl:grid-cols-4";
  // three, or more than four: three across, wrapping into full rows
  return "sm:grid-cols-2 lg:grid-cols-3";
}

/** "Up to 10 rooms", or the honest thing when a plan has no practical cap. */
function roomCap(p: PublicPlan): string {
  return p.maxRooms >= 1000 ? "Unlimited rooms" : `Up to ${p.maxRooms} rooms`;
}

/**
 * The ticks on a card, in the order a buyer reads them.
 *
 * These used to be a map in this file keyed by plan name, which had two faults
 * and the second was the expensive one. A plan the owner created from the panel
 * matched no key and rendered with no features at all. And the bullets promised
 * things nothing enforced — Starter's card never mentioned the restaurant, and
 * a Starter customer could use it all month.
 *
 * They come from the plan now, the same list the API locks on, so what is
 * printed here and what a customer can actually open cannot drift apart. The
 * lines that are not features — everyone gets a calendar and a guest list —
 * stay here as what they always were: the floor, true of every plan.
 */
const EVERY_PLAN = ["Booking calendar & front desk", "Guest database", "Email invoices"];

/**
 * What every agency plan includes, whichever one it is.
 *
 * The resort floor is not the agency floor: an agency has no front desk and no
 * rooms of its own. It sells other people's, which is why "Up to 0 rooms" —
 * what the resort bullets produced from an agency's room cap — was not merely
 * ugly but wrong about what is being bought.
 */
const EVERY_AGENCY_PLAN = [
  "Book every resort open to agencies",
  "Your own client list",
  "Quotations & invoices",
  "Wallet, commission & dues",
];

function planTicks(p: PublicPlan, audience: "RESORT" | "AGENCY"): string[] {
  const staff = p.maxStaff >= 1000 ? "Unlimited staff accounts" : `${p.maxStaff} staff account${p.maxStaff === 1 ? "" : "s"}`;
  if (audience === "AGENCY") {
    return [...EVERY_AGENCY_PLAN, ...p.features.map(planFeatureLabel), staff];
  }
  return [
    roomCap(p),
    ...EVERY_PLAN,
    ...p.features.map(planFeatureLabel),
    staff,
  ];
}

export default function Home({ cms, resortPlans, agencyPlans }: HomeData) {
  const [menuOpen, setMenuOpen] = useState(false);
  /**
   * Which rhythm the price list is showing.
   *
   * Monthly first, always: it is the smaller number and the one a visitor is
   * comparing against. The yearly setting is a thing they choose, not a thing
   * they are shown and have to talk themselves out of.
   */
  const [cycle, setCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  /**
   * Which of the platform's two customers the price list is for.
   *
   * The platform sells to resorts and to travel agencies, and it had one price
   * list: the resort one. An agency arriving at the front door saw prices that
   * were not theirs, no prices that were, and no way to sign up — the only link
   * to `/signup/agency` was a line of small print on the *resort* signup form,
   * which an agency has no reason to open. A marketplace with two sides needs
   * both sides on the page.
   */
  const [audience, setAudience] = useState<"RESORT" | "AGENCY">("RESORT");
  /**
   * Both lists arrive with the page, so the switch is a choice between two
   * things already in hand. It used to re-fetch, which meant the cards emptied
   * and refilled every time somebody looked at the other side.
   */
  const plans = audience === "RESORT" ? resortPlans : agencyPlans;
  // every plan carries its own trial; the line only claims one when they agree
  const trialDays =
    plans && plans.length && plans.every((p) => p.trialDays === plans[0]!.trialDays)
      ? plans[0]!.trialDays
      : 0;
  /** The best yearly saving on the list — what the toggle's badge advertises. */
  const bestSaving = (plans ?? []).reduce<PublicPlan["yearlySaving"]>(
    (best, p) => (p.yearlySaving && (!best || p.yearlySaving.pct > best.pct) ? p.yearlySaving : best),
    null,
  );
  /** Is this particular card being priced by the year right now? */
  const yearlyHere = (p: PublicPlan) => cycle === "YEARLY" && p.yearlyFee != null;

  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
  }, []);

  return (
    <div className="bg-white text-slate-800">
      {/* ── nav ── */}
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/">
            <Logo size={38} sub="Resort management platform" />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 lg:flex">
            <a href="#features" className="hover:text-brand-700">Functionalities</a>
            <a href="#solutions" className="hover:text-brand-700">Solutions</a>
            <a href="#pricing" className="hover:text-brand-700">Pricing</a>
            {/* the platform's other customer, which the nav did not mention at
                all — an agency arriving here had no way to reach its own door */}
            <a href="/signup/agency" className="hover:text-brand-700">For agencies</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:block">
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              Register
            </Link>
            <button onClick={() => setMenuOpen((o) => !o)} className="rounded-lg border border-slate-200 p-2 text-slate-600 lg:hidden">
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="border-t border-slate-100 bg-white px-4 py-3 lg:hidden">
            <div className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              {[["#features", "Functionalities"], ["#solutions", "Solutions"], ["#pricing", "Pricing"], ["/signup/agency", "For agencies"], ["/login", "Log in"]].map(([h, l]) => (
                <a key={h} href={h} onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2 hover:bg-slate-50">
                  {l}
                </a>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* ── hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-brand-100/60 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 top-40 h-72 w-72 rounded-full bg-teal-100/50 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-4 py-1.5 text-xs font-semibold text-brand-700 shadow-sm">
              <Star className="h-3.5 w-3.5 fill-brand-600 text-brand-600" />
              {cms["hero.badge"] || "The all-in-one software for resorts"}
            </div>
            <h1 className="text-4xl font-black leading-[1.08] tracking-tight text-slate-900 sm:text-5xl">
              {/* The same words as the CMS default. The page is a client
                  component, so this fallback is what a crawler and a link
                  preview see, and what shows for the moment before the fetch
                  lands — a different sentence there means Google indexes copy
                  nobody chose, and visitors watch the headline change under
                  them. */}
              {cms["hero.title"] || "Every booking in one place. No room ever sold twice."}
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-slate-600">
              {cms["hero.subtitle"] ||
                "Book rooms for walk-in and phone guests in one click, run the restaurant, pay agents, and see every taka — from your phone or laptop. In Bangla and English."}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="group inline-flex items-center gap-2 rounded-xl bg-brand-600 px-7 py-3.5 text-base font-bold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-700"
              >
                {cms["hero.cta"] || "Create free account"}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-7 py-3.5 text-base font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                See how it works
              </a>
            </div>
            <p className="mt-3 text-xs font-medium text-slate-500">
              {trialDays ? `${trialDays} days free · ` : ""}no card required · cancel anytime
            </p>
            <div className="mt-10 flex items-center gap-8">
              <div>
                <div className="flex items-center gap-1 text-amber-400">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <div className="mt-1 text-xs text-slate-500">Loved by resort teams</div>
              </div>
              <div className="h-10 w-px bg-slate-200" />
              <div>
                <div className="text-2xl font-black text-slate-900">{trialFor(trialDays)}</div>
                <div className="text-xs text-slate-500">free trial on every plan</div>
              </div>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-brand-100/70 to-teal-50" />
            <div className="relative">
              <MockDaySheet />
              <div className="absolute -bottom-6 -left-4 hidden rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg sm:block">
                <div className="flex items-center gap-2.5">
                  <Bell className="h-4 w-4 text-brand-600" />
                  <div>
                    <div className="text-[11px] font-bold text-slate-800">New booking · BK-00095</div>
                    <div className="text-[10px] text-slate-400">Agent Rikan · Lunaria · 2 nights</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── trust bar ── */}
      <section className="border-y border-slate-100 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 sm:grid-cols-4">
          {STAT_KEYS.map((key) => {
            const fallback = STAT_FALLBACKS[key]!;
            // the trial is the plan's to state; the rest are the owner's words
            const value =
              cms[`${key}.value`] || (key === "stats.4" ? trialFor(trialDays) : fallback.n);
            const label = cms[`${key}.label`] || fallback.l;
            return (
              <div key={key} className="text-center">
                <div className="text-3xl font-black text-slate-900">{value}</div>
                <div className="mt-0.5 text-xs font-medium uppercase tracking-wider text-slate-400">{label}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── feature blocks (alternating, bed-booking style) ── */}
      <section id="features" className="bg-white py-20">
        <div className="mx-auto max-w-6xl space-y-20 px-4">
          {[
            {
              tag: "BOOKING CALENDAR",
              title: "Your channel manager to manage reservations",
              body: "See every room, every day, on one screen. With one click check availability on any date and make a booking for the calling customer — no overbooking, no register, no spreadsheet.",
              points: ["Click any open date to book", "Walk-in, phone & agent bookings", "Check-in / check-out & day sheet", "Live availability per room"],
              mock: <MockDaySheet />,
            },
            {
              tag: "FRONT DESK & PMS",
              title: "Run the whole resort from one screen",
              body: "Rooms, rates, extra-person charges, seasonal price plans, discounts and guest history. Everything the front desk touches — without the notebook.",
              points: ["Room types & seasonal rates", "Extra-person pricing", "Resort-wide or per-room discounts", "Guest database & stay history"],
              mock: <MockBooking />,
            },
            {
              tag: "RESTAURANT POS",
              title: "Restaurant billing for walk-ins and room tabs",
              body: "Counter sales and in-house room charges in one POS. Partial payments, daily F&B revenue and separate resort-vs-restaurant reports — all automatic.",
              points: ["Walk-in cash counter", "Charge to room tab", "Partial & full payments", "Separate F&B revenue reports"],
              mock: <MockPos />,
            },
          ].map((f, i) => (
            <div key={f.tag} className={`grid items-center gap-10 lg:grid-cols-2 ${i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""}`}>
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-brand-600">{f.tag}</div>
                <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">{f.title}</h2>
                <p className="mt-4 leading-relaxed text-slate-600">{f.body}</p>
                <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
                  {f.points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-slate-700">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /> {p}
                    </li>
                  ))}
                </ul>
                <Link href="/signup" className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-brand-700 hover:text-brand-800">
                  MORE INFORMATION <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="relative">{f.mock}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── solutions ── */}
      <section id="solutions" className="bg-brand-50/60 py-16">
        <div className="mx-auto max-w-6xl px-4 text-center">
          <h2 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Made for every kind of stay</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {["Resorts", "Eco resorts & cottages", "Guest houses", "Tour agencies", "Multi-property owners"].map((s) => (
              <span key={s} className="rounded-full border border-brand-200 bg-white px-5 py-2.5 text-sm font-semibold text-brand-800 shadow-sm">
                {s}
              </span>
            ))}
          </div>
          <div className="mt-10 grid gap-4 text-left sm:grid-cols-3">
            {[
              { icon: Users, t: "Agents with wallets", d: "Activate trusted agents, give them logins and wallets. They book for clients; you track commission and dues." },
              { icon: ShieldCheck, t: "Roles & activity log", d: "Manager, front desk, housekeeping — least-privilege access with a full who-did-what log." },
              { icon: BarChart3, t: "Money you can trust", d: "Dues, payments, subscription billing and P&L — resort and restaurant separated." },
            ].map((c) => (
              <div key={c.t} className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm">
                <c.icon className="h-6 w-6 text-brand-600" />
                <div className="mt-3 font-bold text-slate-900">{c.t}</div>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── extra capabilities strip ── */}
      <section className="bg-white py-16">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Bell, t: "Notification system", d: "In-app alerts for bookings, dues and agent deadlines." },
            { icon: FileText, t: "Invoice PDF + email", d: "Auto invoice on checkout, printable and emailed to guests." },
            { icon: Smartphone, t: "Works on your phone", d: "Full console on mobile — manage from anywhere." },
            { icon: MessageSquare, t: "Bangla & English", d: "Switch the whole console with one tap." },
          ].map((c) => (
            <div key={c.t} className="rounded-2xl border border-slate-200 p-5">
              <c.icon className="h-5 w-5 text-brand-600" />
              <div className="mt-2.5 text-sm font-bold text-slate-900">{c.t}</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── pricing ── */}
      <section id="pricing" className="bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center">
            <h2 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Simple plans</h2>
            <p className="mt-3 text-slate-500">
              {audience === "AGENCY" ? "Per agency. Cancel anytime." : "Per resort. Cancel anytime."}
              {trialDays ? ` ${trialDays} days free on every plan.` : ""}
            </p>
          </div>

          {/* Who the platform is selling to. Both sides of the marketplace,
              because an agency that cannot find its own prices does not become
              a customer. */}
          <div className="mt-7 flex justify-center">
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              {(
                [
                  ["RESORT", "For resorts"],
                  ["AGENCY", "For travel agencies"],
                ] as const
              ).map(([a, label]) => (
                <button
                  key={a}
                  onClick={() => {
                    setAudience(a);
                    // the shelves price differently; a yearly toggle left on
                    // from the other one would point at plans that may not
                    // have a yearly price at all
                    setCycle("MONTHLY");
                  }}
                  className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                    audience === a ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/**
           * The monthly / yearly switch.
           *
           * It only appears when there is something to switch to, so a price
           * list sold by the month alone does not grow a control with one
           * setting. The saving is the best one on offer across the plans,
           * which is what the badge beside such a toggle always means.
           */}
          {bestSaving && (
            <div className="mt-8 flex justify-center">
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-1 shadow-sm">
                {(["MONTHLY", "YEARLY"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCycle(c)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                      cycle === c ? "bg-brand-600 text-white" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {c === "MONTHLY" ? "Monthly" : "Yearly"}
                    {c === "YEARLY" && (
                      <span
                        className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                          cycle === c ? "bg-white/20 text-white" : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        SAVE {bestSaving.pct}%
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={`mt-12 grid gap-6 ${pricingColumns((plans ?? []).length)}`}>
            {(plans ?? []).map((p) => (
              <div key={p.name} className={`relative flex flex-col rounded-3xl border bg-white p-8 shadow-sm ${p.highlight ? "border-brand-500 shadow-lg shadow-brand-600/10" : "border-slate-200"}`}>
                {p.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white">
                    Most popular
                  </div>
                )}
                <div className="text-lg font-bold text-slate-900">{p.label}</div>
                <div className="mt-1 text-xs text-slate-500">{p.blurb ?? ""}</div>
                {/**
                 * On the yearly setting the big number is still per month —
                 * the figure a reader can compare — with the amount actually
                 * charged underneath. Quoting ৳120,000 against a rival's
                 * ৳12,000 is how a cheaper plan reads as ten times the price.
                 *
                 * Four plans across leaves a card narrower than
                 * "৳12,000.00/month", so the price and the period are allowed
                 * to sit on two lines.
                 */}
                <div className="mt-5 flex flex-wrap items-baseline gap-x-1 text-3xl font-black text-slate-900 sm:text-4xl">
                  <span>
                    {formatMoney(yearlyHere(p) ? p.yearlyFee! / 12 : p.monthlyFee, {
                      currency: "BDT",
                      locale: "en-IN",
                    })}
                  </span>
                  <span className="text-sm font-medium text-slate-400">/month</span>
                </div>
                <div className="mt-1 min-h-[1.25rem] text-xs text-slate-500">
                  {yearlyHere(p) ? (
                    <>
                      {formatMoney(p.yearlyFee!, { currency: "BDT", locale: "en-IN" })} billed yearly
                      {p.yearlySaving && (
                        <span className="ml-1.5 font-semibold text-emerald-700">
                          — save {formatMoney(p.yearlySaving.amount, { currency: "BDT", locale: "en-IN" })}
                        </span>
                      )}
                    </>
                  ) : cycle === "YEARLY" ? (
                    // this one is not sold by the year; say so rather than
                    // silently showing its monthly price under a yearly toggle
                    <span className="text-slate-400">Monthly only</span>
                  ) : null}
                </div>
                <ul className="mt-6 mb-8 space-y-2.5">
                  {planTicks(p, audience).map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-slate-700">
                      <Check className="h-4 w-4 shrink-0 text-brand-600" /> {f}
                    </li>
                  ))}
                </ul>
                {/**
                 * The door that matches the shelf.
                 *
                 * An agency picks its plan as it signs up, so the card carries
                 * the plan across. A resort does not: no subscription is written
                 * at resort signup unless an offer names one — the platform sets
                 * the first one up — so a `plan` on that link would be a
                 * parameter nothing reads. The rhythm travels either way,
                 * because an offer does honour it.
                 */}
                <Link
                  href={
                    audience === "AGENCY"
                      ? `/signup/agency?plan=${p.name}${yearlyHere(p) ? "&billing=YEARLY" : ""}`
                      : yearlyHere(p)
                        ? "/signup?billing=YEARLY"
                        : "/signup"
                  }
                  className={`mt-auto block rounded-xl py-3 text-center text-sm font-bold transition ${p.highlight ? "bg-brand-600 text-white hover:bg-brand-700" : "border border-slate-300 text-slate-700 hover:bg-slate-50"}`}
                >
                  Start free trial
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── testimonials ── */}
      <section className="border-y border-slate-100 bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center">
            <h2 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">More than 10,000 bookings handled</h2>
            <p className="mt-2 text-slate-500">Here&apos;s why resorts switch to Resort Mela</p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              { quote: "The day sheet used to take my manager an hour every morning. Now it opens with everything already there — bookings, dues, restaurant, expenses.", name: "Resort Manager", meta: "Partner resort · Sylhet" },
              { quote: "I manage 3 resorts. Before this I had three Excel files and a notebook. Now one login, three resorts, zero confusion.", name: "Resort Owner", meta: "Multi-property owner" },
              { quote: "My agents used to call for every booking. Now they book from their own accounts and I just approve and track commission.", name: "Owner", meta: "Tour & travel partners" },
            ].map((t) => (
              <div key={t.name} className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
                <div className="flex gap-0.5 text-amber-400">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-slate-600">“{t.quote}”</p>
                <div className="mt-5 text-sm font-bold text-slate-900">{t.name}</div>
                <div className="text-xs text-slate-400">{t.meta}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── final CTA ── */}
      <section className="bg-gradient-to-br from-brand-700 to-brand-900 py-20 text-white">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-4xl font-black tracking-tight">{cms["cta.title"] || `Start today — ${trialDays ? `${trialDays} days free` : "free to try"}`}</h2>
          <p className="mt-4 text-lg text-brand-50/90">
            {cms["cta.body"] ||
              "Every day you wait is another day of register-keeping. Bring your rooms, your team and your agents — and run the whole resort from one screen."}
          </p>
          <Link
            href="/signup"
            className="group mt-9 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-8 py-4 text-base font-bold text-emerald-950 shadow-xl shadow-emerald-950/30 transition hover:bg-emerald-300"
          >
            {cms["cta.button"] || "Create free account"}
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </Link>
        </div>
      </section>

      {/* ── footer ── */}
      <footer id="contact" className="bg-white py-14">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Logo size={38} />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-500">
              The all-in-one resort management platform — booking calendar, front desk, restaurant POS,
              and agents with wallets.
            </p>
            <div className="mt-4 text-xs text-slate-400">support@rootcodebd.com</div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Functionalities</div>
            <div className="mt-4 flex flex-col gap-2.5 text-sm text-slate-600">
              <a href="#features" className="hover:text-brand-700">Booking calendar</a>
              <a href="#features" className="hover:text-brand-700">Front desk & PMS</a>
              <a href="#features" className="hover:text-brand-700">Restaurant POS</a>
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Account</div>
            <div className="mt-4 flex flex-col gap-2.5 text-sm text-slate-600">
              <Link href="/signup" className="hover:text-brand-700">Register</Link>
              <Link href="/login" className="hover:text-brand-700">Log in</Link>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-12 max-w-6xl border-t border-slate-100 px-4 pt-6 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} Resort Mela — reservation calendar & resort management platform. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
