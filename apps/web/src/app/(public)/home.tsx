"use client";

import { useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatMoney, periodNoun, planFeatureLabel, scheduleSentence } from "@rh/shared";
import { Logo } from "@/components/logo";
import type { PublicPlan } from "./plan";
import type { HomeData } from "./home-data";
import { signupHref } from "./signup-href";
import { HeroDevices, HeroGround, IconBubble, MockCalendar, MockFrontDesk, MockRestaurant, type Tone } from "./home-art";
import { ResortScene } from "@/components/art";
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

/** How each of the four figures under the hero is marked. */
const STAT_LOOKS: { icon: ComponentType<{ className?: string }>; tone: Tone }[] = [
  { icon: ShieldCheck, tone: "emerald" },
  { icon: TrendingUp, tone: "sky" },
  { icon: MessageSquare, tone: "violet" },
  { icon: Star, tone: "amber" },
];

/** The three things the product is bought for, each with its picture. */
const FEATURES = [
  {
    tag: "Booking calendar",
    icon: CalendarDays,
    tone: "emerald" as Tone,
    title: "Your channel manager to manage reservations",
    body: "See every room, every day, on one screen. With one click check availability on any date and make a booking for the calling customer — no overbooking, no register, no spreadsheet.",
    points: ["Click any open date to book", "Walk-in, phone & agent bookings", "Check-in / check-out & day sheet", "Live availability per room"],
    mock: <MockCalendar />,
  },
  {
    tag: "Front desk & PMS",
    icon: BedDouble,
    tone: "sky" as Tone,
    title: "Run the whole resort from one screen",
    body: "Rooms, rates, extra-person charges, seasonal price plans, discounts and guest history. Everything the front desk touches — without the notebook.",
    points: ["Room types & seasonal rates", "Extra-person pricing", "Resort-wide or per-room discounts", "Guest database & stay history"],
    mock: <MockFrontDesk />,
  },
  {
    tag: "Restaurant POS",
    icon: UtensilsCrossed,
    tone: "amber" as Tone,
    title: "Restaurant billing for walk-ins and room tabs",
    body: "Counter sales and in-house room charges in one POS. Partial payments, daily F&B revenue and separate resort-vs-restaurant reports — all automatic.",
    points: ["Walk-in cash counter", "Charge to room tab", "Partial & full payments", "Separate F&B revenue reports"],
    mock: <MockRestaurant />,
  },
];

const SOLUTIONS: { label: string; icon: ComponentType<{ className?: string }>; tone: Tone }[] = [
  { label: "Resorts", icon: BedDouble, tone: "emerald" },
  { label: "Eco resorts & cottages", icon: Star, tone: "teal" },
  { label: "Guest houses", icon: Users, tone: "sky" },
  { label: "Tour agencies", icon: Wallet, tone: "violet" },
  { label: "Multi-property owners", icon: BarChart3, tone: "amber" },
];

const PLAN_ICONS = [Receipt, TrendingUp, BarChart3, Star];
const PLAN_TONES: Tone[] = ["sky", "emerald", "violet", "amber"];

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
   * Which shelf the price list is showing, by the owner's own label.
   *
   * This was `"MONTHLY" | "YEARLY"`, which was the whole problem: two words in
   * the source deciding, for every resort on the platform, the only two ways
   * anything could be sold. The shelves are rows now, so the toggle is built
   * from whatever the owner wrote — and the first one is shown by default,
   * because a visitor should meet the price the owner leads with rather than
   * one they have to talk themselves out of.
   */
  const [shelf, setShelf] = useState<string | null>(null);
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
  /**
   * Every shelf on offer across this audience's plans, in the owner's order.
   *
   * A label rather than an id, because the toggle is one control across all
   * the cards and each card's "Yearly" is its own row. A plan that is not on
   * the chosen shelf says so, the way "Monthly only" always did.
   */
  const shelves = (() => {
    const seen: string[] = [];
    for (const p of plans ?? []) {
      for (const sch of p.schedules) if (!seen.includes(sch.label)) seen.push(sch.label);
    }
    return seen;
  })();
  const showing = shelf && shelves.includes(shelf) ? shelf : (shelves[0] ?? null);
  /** This card's schedule on the shelf being shown, or null if it is not on it. */
  const shelfOf = (p: PublicPlan) => p.schedules.find((x) => x.label === showing) ?? null;
  /** The best saving each shelf offers — what the toggle's badge advertises. */
  const bestSavingOn = (label: string) =>
    (plans ?? []).reduce(
      (best, p) => Math.max(best, p.schedules.find((x) => x.label === label)?.savingPct ?? 0),
      0,
    );

  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
  }, []);

  return (
    <div className="bg-white text-slate-800">
      {/* ── nav ── */}
      <header className="sticky top-0 z-50 bg-white/90 shadow-sm shadow-slate-900/5 backdrop-blur">
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
            {/*
              The app is not on Play, so this page is its only door. It
              existed for an hour with nothing linking to it, reachable
              only by typing the address — which is the same as not
              existing, and is what the owner asked about first.
            */}
            <Link href="/app" className="hover:text-brand-700">Get the app</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:block">
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-700 px-4 py-2 text-sm font-bold text-white shadow-md shadow-emerald-600/30 transition hover:-translate-y-0.5"
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
              {[["#features", "Functionalities"], ["#solutions", "Solutions"], ["#pricing", "Pricing"], ["/signup/agency", "For agencies"], ["/app", "Get the app"], ["/login", "Log in"]].map(([h, l]) => (
                <a key={h} href={h} onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2 hover:bg-slate-50">
                  {l}
                </a>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* ── hero ── */}
      <HeroGround>
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-44 pt-14 lg:grid-cols-[1fr_1.05fr] lg:pb-52 lg:pt-20">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold text-emerald-50 ring-1 ring-inset ring-white/25 backdrop-blur">
              <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
              {cms["hero.badge"] || "The all-in-one software for resorts"}
            </div>
            <h1 className="text-4xl font-black leading-[1.05] tracking-tight drop-shadow-sm sm:text-6xl">
              {/* The same words as the CMS default, so a crawler and a link
                  preview read the sentence somebody chose. */}
              {cms["hero.title"] || "Every booking in one place. No room ever sold twice."}
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-emerald-50/90">
              {cms["hero.subtitle"] ||
                "Book rooms for walk-in and phone guests in one click, run the restaurant, pay agents, and see every taka — from your phone or laptop. In Bangla and English."}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-300 to-amber-400 px-7 py-4 text-base font-black text-emerald-950 shadow-xl shadow-emerald-950/30 transition hover:-translate-y-0.5 hover:from-amber-200 hover:to-amber-300"
              >
                {cms["hero.cta"] || "Create free account"}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-7 py-4 text-base font-semibold text-white ring-1 ring-inset ring-white/30 backdrop-blur transition hover:bg-white/20"
              >
                See how it works
              </a>
            </div>
            <p className="mt-3 text-xs font-medium text-emerald-50/80">
              {trialDays ? `${trialDays} days free · ` : ""}no card required · cancel anytime
            </p>
            <div className="mt-10 flex items-center gap-6">
              <div className="flex -space-x-2.5">
                {[
                  ["R", "from-amber-300 to-orange-500"],
                  ["S", "from-sky-300 to-blue-600"],
                  ["T", "from-rose-300 to-pink-600"],
                  ["M", "from-violet-300 to-purple-600"],
                ].map(([l, g]) => (
                  <span key={l} className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br text-sm font-black text-white ring-2 ring-slate-400 ${g}`}>
                    {l}
                  </span>
                ))}
              </div>
              <div>
                <div className="flex items-center gap-0.5 text-amber-300">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <div className="mt-0.5 text-xs text-emerald-50/80">Loved by resort teams · {trialFor(trialDays)} free on every plan</div>
              </div>
            </div>
          </div>
          <HeroDevices />
        </div>
      </HeroGround>

      {/* ── trust bar ── */}
      <section className="relative z-10 -mt-14 px-4">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {STAT_KEYS.map((key, i) => {
            const fallback = STAT_FALLBACKS[key]!;
            // the trial is the plan's to state; the rest are the owner's words
            const value =
              cms[`${key}.value`] || (key === "stats.4" ? trialFor(trialDays) : fallback.n);
            const label = cms[`${key}.label`] || fallback.l;
            const look = STAT_LOOKS[i]!;
            return (
              <div key={key} className="flex items-center gap-3 rounded-3xl bg-white p-4 shadow-xl shadow-slate-900/10 ring-1 ring-slate-100 sm:p-5">
                <IconBubble icon={look.icon} tone={look.tone} />
                <div className="min-w-0">
                  <div className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{value}</div>
                  <div className="text-[11px] font-semibold leading-tight text-slate-500">{label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── feature blocks ── */}
      <section id="features" className="bg-white py-24">
        <div className="mx-auto max-w-6xl space-y-28 px-4">
          {FEATURES.map((f, i) => (
            <div key={f.tag} className={`grid items-center gap-12 lg:grid-cols-2 ${i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""}`}>
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 py-1 pl-1 pr-3 ring-1 ring-slate-100">
                  <IconBubble icon={f.icon} tone={f.tone} size="sm" />
                  <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-600">{f.tag}</span>
                </div>
                <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">{f.title}</h2>
                <p className="mt-4 text-lg leading-relaxed text-slate-600">{f.body}</p>
                <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                  {f.points.map((p) => (
                    <li key={p} className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                        <Check className="h-3 w-3 text-emerald-700" />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
                <Link href="/signup" className="mt-7 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800">
                  Try it free <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="relative">{f.mock}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── solutions ── */}
      <section id="solutions" className="relative overflow-hidden bg-gradient-to-b from-emerald-50 to-white py-24">
        <div className="relative mx-auto max-w-6xl px-4 text-center">
          <h2 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Made for every kind of stay</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {SOLUTIONS.map((s) => (
              <span key={s.label} className="inline-flex items-center gap-2 rounded-full bg-white py-1.5 pl-1.5 pr-4 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-100">
                <IconBubble icon={s.icon} tone={s.tone} size="sm" />
                {s.label}
              </span>
            ))}
          </div>
          <div className="mt-12 grid gap-5 text-left sm:grid-cols-3">
            {[
              { icon: Users, tone: "violet" as Tone, t: "Agents with wallets", d: "Activate trusted agents, give them logins and wallets. They book for clients; you track commission and dues." },
              { icon: ShieldCheck, tone: "sky" as Tone, t: "Roles & activity log", d: "Manager, front desk, housekeeping — least-privilege access with a full who-did-what log." },
              { icon: BarChart3, tone: "emerald" as Tone, t: "Money you can trust", d: "Dues, payments, subscription billing and P&L — resort and restaurant separated." },
            ].map((c) => (
              <div key={c.t} className="group rounded-3xl bg-white p-7 shadow-lg shadow-slate-900/5 ring-1 ring-slate-100 transition hover:-translate-y-1 hover:shadow-xl">
                <IconBubble icon={c.icon} tone={c.tone} size="lg" />
                <div className="mt-5 text-lg font-bold text-slate-900">{c.t}</div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── extra capabilities strip ── */}
      <section className="bg-white py-20">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Bell, tone: "rose" as Tone, t: "Notification system", d: "In-app alerts for bookings, dues and agent deadlines." },
            { icon: FileText, tone: "amber" as Tone, t: "Invoice PDF + email", d: "Auto invoice on checkout, printable and emailed to guests." },
            { icon: Smartphone, tone: "teal" as Tone, t: "Works on your phone", d: "An app of its own, and the full console on mobile — manage from anywhere." },
            { icon: MessageSquare, tone: "violet" as Tone, t: "Bangla & English", d: "Switch the whole console with one tap." },
          ].map((c) => (
            <div key={c.t} className="flex items-start gap-4 rounded-3xl bg-slate-50 p-5">
              <IconBubble icon={c.icon} tone={c.tone} />
              <div>
                <div className="text-sm font-bold text-slate-900">{c.t}</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{c.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── pricing ── */}
      <section id="pricing" className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-emerald-50/60 py-24">
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
                    // the two audiences are sold on their own shelves; a label
                    // left selected from the other one may not exist here at
                    // all, so the choice goes back to whatever this side leads
                    // with
                    setShelf(null);
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
           * The shelf switch.
           *
           * One button per way the owner sells, in their order, with their
           * words on it. It only appears when there is something to switch to,
           * so a price list sold one way alone does not grow a control with a
           * single setting. The badge is the best saving that shelf offers
           * across the plans, which is what the badge beside such a toggle has
           * always meant — and it is computed, so adding a three-year deal
           * gives it a correct badge without anybody typing a percentage.
           */}
          {shelves.length > 1 && (
            <div className="mt-8 flex justify-center">
              <div className="inline-flex flex-wrap items-center justify-center rounded-full border border-slate-200 bg-white p-1 shadow-sm">
                {shelves.map((label) => {
                  const saving = bestSavingOn(label);
                  return (
                    <button
                      key={label}
                      onClick={() => setShelf(label)}
                      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                        showing === label ? "bg-brand-600 text-white" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {label}
                      {saving > 0 && (
                        <span
                          className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                            showing === label ? "bg-white/20 text-white" : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          SAVE {saving}%
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className={`mt-12 grid gap-6 ${pricingColumns((plans ?? []).length)}`}>
            {(plans ?? []).map((p, i) => (
              <div key={p.name} className={`relative flex flex-col rounded-3xl bg-white p-8 transition hover:-translate-y-1 ${p.highlight ? "shadow-2xl shadow-emerald-600/20 ring-2 ring-slate-400" : "shadow-lg shadow-slate-900/5 ring-1 ring-slate-200"}`}>
                {p.highlight && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-300 to-amber-400 px-4 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-950 shadow-md">
                    Most popular
                  </div>
                )}
                <IconBubble icon={PLAN_ICONS[i % PLAN_ICONS.length]!} tone={PLAN_TONES[i % PLAN_TONES.length]!} />
                <div className="mt-4 text-lg font-bold text-slate-900">{p.label}</div>
                <div className="mt-1 text-xs text-slate-500">{p.blurb ?? ""}</div>
                {/**
                 * Two numbers, never one.
                 *
                 * Where the plan is simply priced, the big figure is per month
                 * — the one a reader can compare. Quoting ৳120,000 against a
                 * rival's ৳12,000 is how a cheaper plan reads as ten times the
                 * price, so a yearly shelf still leads with its monthly
                 * equivalent and says what is actually charged underneath.
                 *
                 * Where the owner has built a ladder, the big figure is the
                 * **opening** price and the line under it carries the whole
                 * ladder, ending at the price the customer settles on. That
                 * second clause is not decoration: a card that shows only the
                 * number which gets somebody in is how renewal day becomes an
                 * argument, and it is the single most common complaint against
                 * every company that prices this way.
                 *
                 * The sentence is built by `scheduleSentence` in @rh/shared —
                 * the same function the signup summary and the owner's own
                 * billing screen call, so the three cannot drift.
                 *
                 * Four plans across leaves a card narrower than
                 * "৳12,000.00/month", so the price and the period are allowed
                 * to sit on two lines.
                 */}
                {(() => {
                  const sch = shelfOf(p);
                  if (!sch) {
                    // not on this shelf; say so rather than silently showing a
                    // price from a different one
                    return (
                      <>
                        <div className="mt-5 text-3xl font-black text-slate-300 sm:text-4xl">—</div>
                        <div className="mt-1 min-h-[1.25rem] text-xs text-slate-400">
                          No {showing} price
                        </div>
                      </>
                    );
                  }
                  const money = (n: number) => formatMoney(n, { currency: "BDT", locale: "en-IN" });
                  const opening = sch.phases[0]!;
                  const ladder = sch.phases.length > 1;
                  const plain = !ladder && opening.count === 1 && opening.unit === "MONTH";
                  return (
                    <>
                      <div className="mt-5 flex flex-wrap items-baseline gap-x-1 text-3xl font-black text-slate-900 sm:text-4xl">
                        <span>
                          {ladder
                            ? opening.price === 0
                              ? "Free"
                              : money(opening.price)
                            : money(sch.perMonth)}
                        </span>
                        <span className="text-sm font-medium text-slate-400">
                          {ladder
                            ? opening.price === 0
                              ? ""
                              : `/${periodNoun(opening.unit)}`
                            : "/month"}
                        </span>
                      </div>
                      <div className="mt-1 min-h-[1.25rem] text-xs text-slate-500">
                        {plain ? null : (
                          <>
                            {scheduleSentence(sch.phases, money)}
                            {sch.savingPct > 0 && (
                              <span className="font-semibold text-emerald-700">
                                {" — save "}
                                {money(sch.savingPerMonth)}/month
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </>
                  );
                })()}
                <ul className="mt-6 mb-8 space-y-2.5">
                  {planTicks(p, audience).map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-slate-700">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                        <Check className="h-3 w-3 text-emerald-700" />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                {/**
                 * The door that matches the shelf.
                 *
                 * Both audiences carry the plan across. This once carried it
                 * for agencies only, and the comment here explained why: resort
                 * signup wrote no subscription unless an offer named one, so a
                 * `plan` parameter would have been read by nobody. That stopped
                 * being true when signup started opening a subscription on the
                 * first day, the comment did not change with it, and a resort
                 * that clicked Chain opened on Starter for months.
                 */}
                <Link
                  href={signupHref({ audience, plan: p.name, scheduleId: shelfOf(p)?.id ?? null })}
                  className={`mt-auto block rounded-2xl py-3.5 text-center text-sm font-bold transition ${p.highlight ? "bg-gradient-to-r from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-600/30 hover:-translate-y-0.5" : "bg-slate-900 text-white hover:bg-slate-800"}`}
                >
                  Start free trial
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── testimonials ── */}
      <section className="bg-white py-24">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center">
            <h2 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">More than 10,000 bookings handled</h2>
            <p className="mt-2 text-slate-500">Here&apos;s why resorts switch to Resort Mela</p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              { quote: "The day sheet used to take my manager an hour every morning. Now it opens with everything already there — bookings, dues, restaurant, expenses.", name: "Resort Manager", meta: "Partner resort · Sylhet", tone: "from-emerald-400 to-teal-600" },
              { quote: "I manage 3 resorts. Before this I had three Excel files and a notebook. Now one login, three resorts, zero confusion.", name: "Resort Owner", meta: "Multi-property owner", tone: "from-sky-400 to-blue-600" },
              { quote: "My agents used to call for every booking. Now they book from their own accounts and I just approve and track commission.", name: "Owner", meta: "Tour & travel partners", tone: "from-amber-300 to-orange-500" },
            ].map((t) => (
              <div key={t.name} className="relative flex flex-col rounded-3xl bg-slate-50 p-7">
                <span aria-hidden className="absolute right-6 top-3 font-serif text-7xl leading-none text-emerald-200">&ldquo;</span>
                <div className="flex gap-0.5 text-amber-400">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <p className="relative mt-4 flex-1 text-[15px] leading-relaxed text-slate-700">{t.quote}</p>
                <div className="mt-6 flex items-center gap-3">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br text-base font-black text-white ${t.tone}`}>{t.name.charAt(0)}</span>
                  <div>
                    <div className="text-sm font-bold text-slate-900">{t.name}</div>
                    <div className="text-xs text-slate-400">{t.meta}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── final CTA ── */}
      <section className="px-4 pb-20">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-600 px-6 pb-40 pt-16 text-center text-white sm:pb-48">
          <div aria-hidden className="pointer-events-none absolute right-[14%] top-10 h-28 w-28 rounded-full bg-amber-300/40 blur-2xl" />
          <div aria-hidden className="pointer-events-none absolute right-[16%] top-16 h-12 w-12 rounded-full bg-amber-300/90" />
          <ResortScene sky={false} className="pointer-events-none absolute inset-x-0 bottom-0 h-48 w-full opacity-70 sm:h-56 [mask-image:linear-gradient(to_bottom,transparent,black_45%)]" />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-4xl font-black tracking-tight sm:text-5xl">{cms["cta.title"] || `Start today — ${trialDays ? `${trialDays} days free` : "free to try"}`}</h2>
            <p className="mt-4 text-lg text-emerald-50/90">
              {cms["cta.body"] ||
                "Every day you wait is another day of register-keeping. Bring your rooms, your team and your agents — and run the whole resort from one screen."}
            </p>
            <Link
              href="/signup"
              className="group mt-9 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-300 to-amber-400 px-8 py-4 text-base font-black text-emerald-950 shadow-xl shadow-emerald-950/30 transition hover:-translate-y-0.5"
            >
              {cms["cta.button"] || "Create free account"}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </Link>
          </div>
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
            <div className="mt-4 text-xs text-slate-400">support@resortmela.com</div>
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
              <Link href="/app" className="hover:text-brand-700">Android app</Link>
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
