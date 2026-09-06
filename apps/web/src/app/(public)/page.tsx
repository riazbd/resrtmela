"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  Globe,
  Smartphone,
  FileText,
  ShieldCheck,
  ChevronDown,
  Code2,
  Plug,
  Bell,
} from "lucide-react";

const STATS = [
  { n: "89+", l: "Bookings managed" },
  { n: "৳1M+", l: "Revenue tracked" },
  { n: "10", l: "Rooms under management" },
  { n: "99.9%", l: "Uptime" },
];

const FEATURES = [
  {
    icon: CalendarDays,
    tag: "BOOKING CALENDAR",
    title: "One calendar for every room",
    body: "See every arrival, departure and gap at a glance. Click any free date to create a booking for a walk-in or a phone caller in seconds — the way resorts actually work.",
    points: ["Drag-free, click-to-book", "Live availability per room", "Check-in / check-out states", "Bangla & English"],
    grad: "from-emerald-600 to-teal-400",
  },
  {
    icon: BedDouble,
    tag: "FRONT DESK & PMS",
    title: "Run the whole resort from one screen",
    body: "Room rates, extra-person charges, discounts, day sheet, dues and guest history — everything your front desk touches, without spreadsheets.",
    points: ["Room types & rates", "Extra person pricing", "Resort-wide or per-room discounts", "Guest database"],
    grad: "from-teal-600 to-emerald-400",
  },
  {
    icon: UtensilsCrossed,
    tag: "RESTAURANT POS",
    title: "Room-tab restaurant billing",
    body: "In-house guests eat first and pay with their room. Walk-in bills, partial payments and daily F&B revenue reports included.",
    points: ["Charge to room", "Partial & full payments", "Daily F&B revenue", "Bangla item names"],
    grad: "from-amber-500 to-orange-400",
  },
  {
    icon: Users,
    tag: "AGENTS & WALLETS",
    title: "Sell through agents — with control",
    body: "Activate trusted agents, give them their own login and wallet. They book for their clients, you track commission and dues automatically. No walk-ins under an agent's name.",
    points: ["Owner-approved activation", "Agent wallet & top-ups", "Commission tracking", "Per-agent reports"],
    grad: "from-violet-600 to-fuchsia-400",
  },
  {
    icon: Wallet,
    tag: "MONEY",
    title: "Dues, payments & audit trail",
    body: "Every taka in and out is recorded. Advance payments, refunds, subscription dues, and a role-based activity log so you always know who did what.",
    points: ["Payment history per booking", "Subscription dues tracking", "Role activity log", "Invoice PDFs by email"],
    grad: "from-sky-600 to-cyan-400",
  },
  {
    icon: Plug,
    tag: "FOR DEVELOPERS",
    title: "API for your resort website",
    body: "Already have a website? Drop in our booking API or embed the hosted booking page. Availability, rates and bookings — synced with your console in real time.",
    points: ["REST API keys", "Availability & rates endpoints", "Hosted booking page", "Webhooks on new bookings"],
    grad: "from-slate-600 to-slate-400",
  },
];

const PLANS = [
  {
    name: "Starter",
    price: "৳2,500",
    period: "/month",
    tagline: "For small resorts getting off spreadsheets",
    features: ["Up to 10 rooms", "Booking calendar & front desk", "Guest database", "Email invoices", "1 staff account"],
    cta: "Start free trial",
    highlight: false,
  },
  {
    name: "Growth",
    price: "৳5,000",
    period: "/month",
    tagline: "For busy resorts with agents & restaurant",
    features: [
      "Up to 40 rooms",
      "Everything in Starter",
      "Restaurant POS & room tabs",
      "Agents with wallets",
      "Discount engine",
      "5 staff accounts",
    ],
    cta: "Start free trial",
    highlight: true,
  },
  {
    name: "Chain",
    price: "৳12,000",
    period: "/month",
    tagline: "For multi-resort owners",
    features: ["Unlimited rooms & resorts", "Everything in Growth", "Public API + booking embed", "Role activity logs", "Priority support"],
    cta: "Talk to us",
    highlight: false,
  },
];

const TESTIMONIALS = [
  {
    quote: "The day sheet used to take my manager an hour every morning. Now it opens and everything is already there — bookings, dues, restaurant, expenses.",
    name: "Resort Manager",
    meta: "Sky Eco Resort & Restaurant",
  },
  {
    quote: "I manage 3 resorts. Before this I had three different Excel files and a notebook. Now one login, three resorts, zero confusion.",
    name: "Resort Owner",
    meta: "Multi-property owner",
  },
  {
    quote: "My agents used to call me for every booking. Now they book from their own account and I just approve and track commission.",
    name: "Owner",
    meta: "Tour & travel partners",
  },
];

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", on);
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <div className="bg-slate-950 text-white">
      {/* ── nav ── */}
      <header className={`fixed inset-x-0 top-0 z-50 transition ${scrolled ? "bg-slate-950/85 backdrop-blur border-b border-white/5" : ""}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 font-bold text-emerald-300">R</div>
            <div>
              <div className="text-sm font-bold leading-tight">Resort Mela</div>
              <div className="text-[10px] text-emerald-200/60">Resort management platform</div>
            </div>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <a href="#features" className="transition hover:text-white">Features</a>
            <a href="#how" className="transition hover:text-white">How it works</a>
            <a href="#pricing" className="transition hover:text-white">Pricing</a>
            <a href="#api" className="transition hover:text-white">API</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden text-sm text-slate-300 hover:text-white sm:block">
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-300"
            >
              Register free
            </Link>
          </div>
        </div>
      </header>

      {/* ── hero ── */}
      <section className="relative flex min-h-screen items-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-950 via-slate-950 to-teal-950" />
        <div className="anim-float absolute -left-32 top-10 h-[28rem] w-[28rem] rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="anim-float-slow absolute -right-24 bottom-0 h-[32rem] w-[32rem] rounded-full bg-teal-400/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "26px 26px" }}
        />

        <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-24 pt-36">
          <div className="grid items-center gap-14 lg:grid-cols-[1.15fr_1fr]">
            <div className="anim-rise" style={{ animationDelay: "0.05s" }}>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-4 py-1.5 text-xs font-medium text-emerald-300">
                <Sparkle /> The all-in-one platform for resorts
              </div>
              <h1 className="text-5xl font-black leading-[1.04] tracking-tight sm:text-6xl">
                Run your resort.
                <br />
                <span className="bg-gradient-to-r from-emerald-300 to-teal-200 bg-clip-text text-transparent">
                  Bookings, kitchen, agents & money.
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
                Resort Mela replaces the register, the spreadsheet and the phone calls — one calendar, one
                dashboard, every room, every agent, every taka. Built for Bangladeshi resorts, in Bangla and English.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <Link
                  href="/signup"
                  className="group inline-flex items-center gap-2 rounded-full bg-emerald-400 px-7 py-3.5 text-base font-bold text-emerald-950 shadow-xl shadow-emerald-500/30 transition hover:bg-emerald-300"
                >
                  Create free account
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </Link>
                <a
                  href="#features"
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 px-7 py-3.5 text-base font-semibold text-white/90 transition hover:border-white/40 hover:bg-white/5"
                >
                  See how it works
                </a>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-8 gap-y-2 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> 14-day free trial</span>
                <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> No card required</span>
                <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Pay at resort billing</span>
              </div>
            </div>

            {/* product mock */}
            <div className="anim-rise relative" style={{ animationDelay: "0.25s" }}>
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-2xl backdrop-blur">
                <div className="mb-3 flex items-center justify-between px-1">
                  <div className="text-xs font-semibold text-slate-300">Today · Sky Eco Resort</div>
                  <div className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-bold text-emerald-300">LIVE</div>
                </div>
                <MockCalendar />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    { l: "Arrivals", v: "6", c: "text-emerald-300" },
                    { l: "In-house", v: "14", c: "text-sky-300" },
                    { l: "Dues", v: "৳48,200", c: "text-amber-300" },
                  ].map((s) => (
                    <div key={s.l} className="rounded-xl border border-white/10 bg-slate-900/60 p-3">
                      <div className={`text-lg font-black ${s.c}`}>{s.v}</div>
                      <div className="text-[10px] text-slate-400">{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="absolute -bottom-5 -left-5 rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 shadow-xl">
                <div className="flex items-center gap-2.5">
                  <Bell className="h-4 w-4 text-emerald-400" />
                  <div>
                    <div className="text-[11px] font-semibold">New booking · BK-00095</div>
                    <div className="text-[10px] text-slate-400">Agent Rikan · Lunaria · 2 nights</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <a href="#stats" className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 text-slate-500">
          <ChevronDown className="anim-bounce-soft h-7 w-7" />
        </a>
      </section>

      {/* ── stats ── */}
      <section id="stats" className="border-y border-white/5 bg-emerald-950/40 py-14">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.l} className="text-center">
              <div className="bg-gradient-to-b from-white to-emerald-300 bg-clip-text text-4xl font-black text-transparent">{s.n}</div>
              <div className="mt-1 text-xs uppercase tracking-widest text-slate-400">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── features ── */}
      <section id="features" className="bg-slate-950 py-24">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-14 max-w-2xl">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">Everything included</div>
            <h2 className="mt-2 text-4xl font-black tracking-tight">One platform. Every part of the resort.</h2>
            <p className="mt-3 text-slate-400">
              From the front desk calendar to the kitchen tab to your agents' wallets — Resort Mela keeps the
              whole business in one place, on the web and on your phone.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="anim-rise group rounded-3xl border border-white/10 bg-white/[0.03] p-7 transition duration-300 hover:-translate-y-1.5 hover:border-emerald-400/30"
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                <div className={`mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${f.grad}`}>
                  <f.icon className="h-6 w-6 text-white" />
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/80">{f.tag}</div>
                <div className="mt-1.5 text-lg font-bold">{f.title}</div>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.body}</p>
                <ul className="mt-4 space-y-1.5">
                  {f.points.map((p) => (
                    <li key={p} className="flex items-center gap-2 text-xs text-slate-300">
                      <Check className="h-3.5 w-3.5 text-emerald-400" /> {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── how it works ── */}
      <section id="how" className="bg-emerald-950/40 py-24">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-14 text-center">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">How it works</div>
            <h2 className="mt-2 text-4xl font-black tracking-tight">Live in one afternoon</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { n: "1", t: "Create your account", d: "Register, name your resort, add rooms and rates. Import your existing guest data from a spreadsheet." },
              { n: "2", t: "Put your calendar to work", d: "Click any open date to book a caller, check guests in, and charge dinner to their room — all from one screen." },
              { n: "3", t: "Grow with agents & API", d: "Activate agents with wallets, embed booking on your website, and watch revenue reports update in real time." },
            ].map((s, i) => (
              <div key={s.n} className="anim-rise relative rounded-3xl border border-white/10 bg-white/[0.03] p-8" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400 text-lg font-black text-emerald-950">{s.n}</div>
                <div className="text-lg font-bold">{s.t}</div>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── pricing ── */}
      <section id="pricing" className="bg-slate-950 py-24">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-14 text-center">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">Pricing</div>
            <h2 className="mt-2 text-4xl font-black tracking-tight">Simple monthly plans</h2>
            <p className="mt-3 text-slate-400">Per resort. Cancel anytime. 14 days free on every plan.</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {PLANS.map((p, i) => (
              <div
                key={p.name}
                className={`anim-rise relative rounded-3xl border p-8 ${p.highlight ? "border-emerald-400/50 bg-gradient-to-b from-emerald-500/10 to-transparent shadow-2xl shadow-emerald-500/10" : "border-white/10 bg-white/[0.03]"}`}
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                {p.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-400 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-950">
                    Most popular
                  </div>
                )}
                <div className="text-lg font-bold">{p.name}</div>
                <div className="mt-1 text-xs text-slate-400">{p.tagline}</div>
                <div className="mt-5 text-4xl font-black">
                  {p.price}
                  <span className="text-sm font-medium text-slate-400">{p.period}</span>
                </div>
                <ul className="mt-6 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-slate-300">
                      <Check className="h-4 w-4 shrink-0 text-emerald-400" /> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`mt-8 block rounded-full py-3 text-center text-sm font-bold transition ${p.highlight ? "bg-emerald-400 text-emerald-950 hover:bg-emerald-300" : "border border-white/15 text-white hover:bg-white/5"}`}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── API band ── */}
      <section id="api" className="bg-emerald-950/40 py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 lg:grid-cols-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">For your website</div>
            <h2 className="mt-2 text-3xl font-black tracking-tight">Already have a resort website? Keep it.</h2>
            <p className="mt-3 leading-relaxed text-slate-400">
              Plug Resort Mela into your existing site — or embed our hosted booking page in five minutes.
              Live availability and rates from your console, bookings straight into your calendar. No commission, no middleman.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-slate-300">
              <li className="flex items-center gap-2"><Code2 className="h-4 w-4 text-emerald-400" /> REST API with per-resort keys</li>
              <li className="flex items-center gap-2"><Globe className="h-4 w-4 text-emerald-400" /> Hosted booking page on your domain</li>
              <li className="flex items-center gap-2"><FileText className="h-4 w-4 text-emerald-400" /> Webhooks for new bookings & payments</li>
            </ul>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 p-5 font-mono text-xs leading-relaxed shadow-2xl">
            <div className="mb-3 flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
            </div>
            <div><span className="text-slate-500"># check availability</span></div>
            <div><span className="text-emerald-300">curl</span> https://api.resortmela.com/v1/availability \</div>
            <div className="pl-4">-H <span className="text-amber-300">"X-Api-Key: rm_live_…"</span></div>
            <div className="mt-2 text-slate-500"># response</div>
            <div className="text-sky-300">{"{"}</div>
            <div className="pl-4 text-slate-300">"roomType": <span className="text-emerald-300">"Lunaria"</span>,</div>
            <div className="pl-4 text-slate-300">"available": <span className="text-emerald-300">3</span>,</div>
            <div className="pl-4 text-slate-300">"pricePerNight": <span className="text-emerald-300">7500</span></div>
            <div className="text-sky-300">{"}"}</div>
          </div>
        </div>
      </section>

      {/* ── testimonials ── */}
      <section className="bg-slate-950 py-24">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-12 text-center">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">Loved by resort teams</div>
            <h2 className="mt-2 text-4xl font-black tracking-tight">They stopped juggling notebooks</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <div key={t.name} className="anim-rise rounded-3xl border border-white/10 bg-white/[0.03] p-7" style={{ animationDelay: `${i * 0.08}s` }}>
                <div className="flex gap-0.5 text-amber-400">
                  {[...Array(5)].map((_, s) => (
                    <Star key={s} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-slate-300">“{t.quote}”</p>
                <div className="mt-5 text-sm font-bold">{t.name}</div>
                <div className="text-xs text-slate-500">{t.meta}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── final CTA ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-600 to-teal-700 py-24">
        <div className="anim-float absolute -left-20 top-0 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        <div className="relative mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-4xl font-black tracking-tight sm:text-5xl">Start today — free for 14 days</h2>
          <p className="mt-4 text-lg text-emerald-50/90">
            No card, no obligation. Bring your rooms, your team and your agents — and see your whole resort on one screen.
          </p>
          <Link
            href="/signup"
            className="group mt-9 inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-bold text-emerald-700 shadow-xl transition hover:bg-emerald-50"
          >
            Create free account
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </Link>
        </div>
      </section>

      {/* ── footer ── */}
      <footer className="border-t border-white/5 bg-slate-950 py-14">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/10 font-bold text-emerald-300">R</div>
              <div className="text-sm font-bold">Resort Mela</div>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">
              The all-in-one resort management platform — booking calendar, front desk, restaurant POS,
              agents with wallets, and a booking API for your website.
            </p>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-emerald-400/70">Product</div>
            <div className="mt-4 flex flex-col gap-2.5 text-sm text-slate-400">
              <a href="#features" className="hover:text-white">Features</a>
              <a href="#pricing" className="hover:text-white">Pricing</a>
              <a href="#api" className="hover:text-white">Booking API</a>
              <Link href="/book" className="hover:text-white">Guest booking</Link>
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-emerald-400/70">Account</div>
            <div className="mt-4 flex flex-col gap-2.5 text-sm text-slate-400">
              <Link href="/signup" className="hover:text-white">Register</Link>
              <Link href="/login" className="hover:text-white">Log in</Link>
              <Link href="/book/trips" className="hover:text-white">My trips</Link>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-12 max-w-6xl border-t border-white/5 px-4 pt-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Resort Mela — resort management platform. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

function Sparkle() {
  return <Star className="h-3.5 w-3.5" />;
}

function MockCalendar() {
  const cells = [
    { s: "in", r: "Camellia", g: "Raju" },
    { s: "stay", r: "Lunaria", g: "shakil" },
    { s: "free", r: "Snow Drop", g: "" },
    { s: "stay", r: "Cherry", g: "local" },
    { s: "out", r: "Margarita", g: "maliha" },
    { s: "free", r: "Lavender", g: "" },
    { s: "in", r: "Kath Golap", g: "Rikan" },
    { s: "stay", r: "Jasmine", g: "Kazi" },
    { s: "oos", r: "Magnolia", g: "" },
    { s: "oos", r: "Rose", g: "" },
  ];
  const style: Record<string, string> = {
    in: "bg-emerald-500/20 border-emerald-400/40 text-emerald-200",
    stay: "bg-sky-500/15 border-sky-400/30 text-sky-200",
    out: "bg-amber-500/15 border-amber-400/30 text-amber-200",
    free: "bg-white/[0.03] border-white/10 text-slate-500",
    oos: "bg-white/[0.02] border-white/5 text-slate-600 line-through",
  };
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {cells.map((c, i) => (
        <div key={i} className={`rounded-lg border px-2.5 py-2 ${style[c.s]}`}>
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-semibold">{c.r}</span>
            <span className="truncate opacity-70">{c.g || (c.s === "free" ? "available" : c.s === "oos" ? "oos" : "")}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
