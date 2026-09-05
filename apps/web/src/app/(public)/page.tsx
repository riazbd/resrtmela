"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BedDouble,
  Users,
  MapPin,
  Sparkles,
  ShieldCheck,
  Clock3,
  Smartphone,
  UtensilsCrossed,
  Compass,
  CalendarCheck,
  ArrowRight,
  ChevronDown,
  Sun,
  Waves,
  Coffee,
  Music,
  Flower2,
  Star,
} from "lucide-react";
import { api, bdt, type GuestResort } from "@/lib/api";

const ROOM_GRADIENTS = [
  "from-emerald-600 to-teal-400",
  "from-teal-700 to-emerald-400",
  "from-green-700 to-lime-400",
  "from-cyan-700 to-emerald-500",
  "from-emerald-800 to-green-400",
  "from-teal-600 to-cyan-400",
  "from-lime-700 to-emerald-400",
  "from-emerald-500 to-teal-300",
];

const CATEGORY_STYLE: Record<string, { grad: string; icon: typeof Compass }> = {
  TOUR: { grad: "from-sky-600 to-cyan-400", icon: Compass },
  WATER_SPORTS: { grad: "from-blue-600 to-sky-400", icon: Waves },
  WELLNESS: { grad: "from-fuchsia-600 to-pink-400", icon: Flower2 },
  DINING: { grad: "from-amber-600 to-orange-400", icon: Coffee },
  ENTERTAINMENT: { grad: "from-violet-600 to-fuchsia-400", icon: Music },
  OTHER: { grad: "from-slate-600 to-slate-400", icon: Sparkles },
};

const MARQUEE = [
  "Free WiFi",
  "Lake-side Villas",
  "Multi-cuisine Restaurant",
  "Bonfire Evenings",
  "Adventure Tours",
  "Family Suites",
  "24×7 Room Service",
  "Kids Play Zone",
];

const WHY = [
  { icon: CalendarCheck, title: "Instant booking", body: "Pick your dates, see live availability and confirm in under a minute." },
  { icon: ShieldCheck, title: "Pay at the resort", body: "Reserve now, settle by cash, bKash or card when you arrive." },
  { icon: Clock3, title: "Real-time calendar", body: "What you see is what's free — synced with the resort's live day sheet." },
  { icon: Smartphone, title: "Booking on your phone", body: "Track every trip, invoice and receipt from your pocket." },
  { icon: UtensilsCrossed, title: "In-house restaurant", body: "Order from the resort kitchen straight to your room tab." },
  { icon: Sun, title: "Tours & activities", body: "Boating, sightseeing and curated experiences booked with your stay." },
];

function gradientFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return ROOM_GRADIENTS[h % ROOM_GRADIENTS.length];
}

export default function HomePage() {
  const [resort, setResort] = useState<GuestResort | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api<GuestResort[]>("/guest/resorts")
      .then((rs) => setResort(rs[0] ?? null))
      .catch(() => setResort(null))
      .finally(() => setLoaded(true));
  }, []);

  const roomTypes = resort?.roomTypes ?? [];
  const activities = resort?.activities ?? [];
  const prices = roomTypes.map((t) => t.priceFrom).filter((p): p is number => p !== null);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const bookHref = resort ? `/book/${resort.id}` : "/book";

  return (
    <div className="bg-slate-950 text-white">
      {/* ── nav ── */}
      <header className="fixed inset-x-0 top-0 z-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 font-bold backdrop-blur">R</div>
            <div>
              <div className="text-sm font-bold leading-tight">Resort Mela</div>
              <div className="text-[10px] text-emerald-200/70">Stay · Dine · Explore</div>
            </div>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-emerald-50/80 md:flex">
            <a href="#rooms" className="transition hover:text-white">Rooms</a>
            <a href="#activities" className="transition hover:text-white">Activities</a>
            <a href="#why" className="transition hover:text-white">Why us</a>
            <a href="#contact" className="transition hover:text-white">Contact</a>
          </nav>
          <Link
            href={bookHref}
            className="rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-300"
          >
            Book now
          </Link>
        </div>
      </header>

      {/* ── hero ── */}
      <section className="relative flex min-h-screen items-center overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <img
            src="https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=2400&q=80"
            alt="Resort pool surrounded by palm trees and villas"
            className="anim-kenburns h-full w-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/80 via-emerald-950/45 to-emerald-950/85" />
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-950/60 via-transparent to-transparent" />
        <div className="anim-float absolute -left-32 top-10 h-[28rem] w-[28rem] rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="anim-float-slow absolute -right-24 bottom-0 h-[32rem] w-[32rem] rounded-full bg-teal-400/15 blur-3xl" />

        <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-28 pt-32">
          <div className="anim-rise max-w-3xl" style={{ animationDelay: "0.05s" }}>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium text-emerald-100 backdrop-blur">
              <MapPin className="h-3.5 w-3.5" />
              {resort?.location ?? "Bangladesh"}
              <span className="text-emerald-300/60">·</span>
              <span className="text-emerald-300">স্বাগতম</span>
            </div>
            <h1 className="text-5xl font-black leading-[1.05] tracking-tight sm:text-7xl">
              {resort?.name ?? "Resort Mela"}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-emerald-50/80">
              Wake up to greenery, dine by the water, and let the kids run free.
              Book your rooms, tours and table in one place — pay when you arrive.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href={bookHref}
                className="group inline-flex items-center gap-2 rounded-full bg-emerald-400 px-7 py-3.5 text-base font-bold text-emerald-950 shadow-xl shadow-emerald-500/30 transition hover:bg-emerald-300"
              >
                Book your stay
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
              <a
                href="#rooms"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-7 py-3.5 text-base font-semibold text-white/90 backdrop-blur transition hover:border-white/40 hover:bg-white/5"
              >
                Explore rooms
              </a>
            </div>
          </div>

          {minPrice !== null && (
            <div
              className="anim-rise mt-14 inline-flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 backdrop-blur-md"
              style={{ animationDelay: "0.3s" }}
            >
              <BedDouble className="h-8 w-8 text-emerald-300" />
              <div>
                <div className="text-3xl font-black">{bdt(minPrice)}</div>
                <div className="text-xs text-emerald-100/60">per night · all room types</div>
              </div>
            </div>
          )}
        </div>

        <a href="#stats" className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 text-emerald-200/60">
          <ChevronDown className="anim-bounce-soft h-7 w-7" />
        </a>
      </section>

      {/* ── marquee ── */}
      <div className="overflow-hidden border-y border-white/5 bg-emerald-950/80 py-4">
        <div className="anim-marquee flex w-max gap-10 whitespace-nowrap">
          {[...MARQUEE, ...MARQUEE].map((m, i) => (
            <span key={i} className="flex items-center gap-10 text-sm font-medium tracking-wide text-emerald-100/60">
              {m} <Star className="h-3.5 w-3.5 text-emerald-500" />
            </span>
          ))}
        </div>
      </div>

      {/* ── stats ── */}
      <section id="stats" className="bg-emerald-950 py-16">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 md:grid-cols-4">
          {[
            { n: resort?.roomCount ?? "—", l: "Rooms ready" },
            { n: roomTypes.length, l: "Room types" },
            { n: activities.length, l: "Experiences" },
            { n: "24/7", l: "Front desk" },
          ].map((s) => (
            <div key={s.l} className="text-center">
              <div className="bg-gradient-to-b from-white to-emerald-300 bg-clip-text text-4xl font-black text-transparent">{s.n}</div>
              <div className="mt-1 text-xs uppercase tracking-widest text-emerald-200/50">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── rooms ── */}
      <section id="rooms" className="bg-slate-950 py-24">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-12 flex items-end justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">Stay</div>
              <h2 className="mt-2 text-4xl font-black tracking-tight">Rooms & suites</h2>
            </div>
            <Link href={bookHref} className="hidden items-center gap-1.5 text-sm font-semibold text-emerald-400 hover:text-emerald-300 sm:inline-flex">
              Check live availability <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {roomTypes.map((t, i) => (
              <Link key={t.id} href={bookHref} className="group anim-rise" style={{ animationDelay: `${i * 0.06}s` }}>
                <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] transition duration-300 group-hover:-translate-y-1.5 group-hover:border-emerald-400/30 group-hover:shadow-2xl group-hover:shadow-emerald-500/10">
                  <div className={`relative flex h-44 items-end bg-gradient-to-br ${gradientFor(t.name)} p-5`}>
                    <div
                      className="absolute inset-0 opacity-20"
                      style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "18px 18px" }}
                    />
                    <div>
                      <div className="text-xl font-bold">{t.name}</div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-white/80">
                        <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {t.maxAdults}+{t.maxChildren}</span>
                        {t.totalRooms != null && <span>{t.totalRooms} rooms</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-5">
                    <div>
                      {t.priceFrom !== null ? (
                        <>
                          <div className="text-2xl font-black text-emerald-400">{bdt(t.priceFrom)}</div>
                          <div className="text-[11px] text-slate-400">per night</div>
                        </>
                      ) : (
                        <div className="text-sm text-slate-400">Ask at front desk</div>
                      )}
                    </div>
                    <div className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/80 transition group-hover:border-emerald-400 group-hover:bg-emerald-400 group-hover:text-emerald-950">
                      Reserve
                    </div>
                  </div>
                </div>
              </Link>
            ))}
            {roomTypes.length === 0 && (
              <div className="col-span-full rounded-3xl border border-white/10 p-10 text-center text-slate-400">
                Room details coming soon — call the resort to book.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── activities ── */}
      {activities.length > 0 && (
        <section id="activities" className="bg-emerald-950 py-24">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mb-12">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">Play</div>
              <h2 className="mt-2 text-4xl font-black tracking-tight">Things to do</h2>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {activities.slice(0, 8).map((a, i) => {
                const style = CATEGORY_STYLE[a.category] ?? CATEGORY_STYLE.OTHER!;
                const Icon = style.icon;
                return (
                  <div
                    key={a.id}
                    className="group anim-rise rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition duration-300 hover:-translate-y-1.5 hover:border-emerald-400/30"
                    style={{ animationDelay: `${i * 0.05}s` }}
                  >
                    <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${style.grad}`}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div className="font-bold">{a.name}</div>
                    <div className="mt-1 text-xs text-emerald-100/50">{a.durationMin} min experience</div>
                    <div className="mt-4 text-lg font-bold text-emerald-400">{bdt(a.price)} <span className="text-xs font-normal text-slate-400">/ person</span></div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── why us ── */}
      <section id="why" className="bg-slate-950 py-24">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-12 text-center">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">Why Resort Mela</div>
            <h2 className="mt-2 text-4xl font-black tracking-tight">Built for easy weekends</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {WHY.map((w, i) => (
              <div
                key={w.title}
                className="anim-rise rounded-3xl border border-white/10 bg-white/[0.03] p-7 transition duration-300 hover:-translate-y-1 hover:border-emerald-400/30"
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400/10 ring-1 ring-emerald-400/30">
                  <w.icon className="h-5 w-5 text-emerald-300" />
                </div>
                <div className="font-bold">{w.title}</div>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative overflow-hidden bg-emerald-950 py-24">
        <div className="anim-float absolute -left-20 top-0 h-80 w-80 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="anim-float-slow absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-teal-400/15 blur-3xl" />
        <div className="relative mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-4xl font-black tracking-tight sm:text-5xl">Weekend plans?</h2>
          <p className="mt-4 text-lg text-emerald-50/70">
            Rooms go fast on holidays. Lock yours now — pay at the resort, change for free up to 48h before check-in.
          </p>
          <Link
            href={bookHref}
            className="group mt-9 inline-flex items-center gap-2 rounded-full bg-emerald-400 px-8 py-4 text-base font-bold text-emerald-950 shadow-xl shadow-emerald-500/30 transition hover:bg-emerald-300"
          >
            Reserve a room
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </Link>
        </div>
      </section>

      {/* ── footer ── */}
      <footer id="contact" className="border-t border-white/5 bg-slate-950 py-14">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/10 font-bold text-emerald-300">R</div>
              <div className="text-sm font-bold">Resort Mela</div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              {resort?.name ?? "Your resort"} — rooms, dining and experiences, bookable in one place.
            </p>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-emerald-400/70">Explore</div>
            <div className="mt-4 flex flex-col gap-2.5 text-sm text-slate-400">
              <a href="#rooms" className="hover:text-white">Rooms & rates</a>
              <a href="#activities" className="hover:text-white">Activities</a>
              <Link href={bookHref} className="hover:text-white">Book a stay</Link>
              <Link href="/book/trips" className="hover:text-white">My trips</Link>
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-emerald-400/70">Visit</div>
            <div className="mt-4 flex flex-col gap-2.5 text-sm text-slate-400">
              <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-emerald-500" />{resort?.location ?? "Bangladesh"}</span>
              <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-emerald-500" />Check-in 12:00 PM · Check-out 10:00 AM</span>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-12 max-w-6xl border-t border-white/5 px-4 pt-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Resort Mela · Powered by Resort Mela Console
        </div>
      </footer>
      {!loaded && <div className="fixed inset-0 z-50 bg-slate-950" />}
    </div>
  );
}
