"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { LangProvider, useLang, type DictKey } from "@/lib/i18n";
import { Select } from "@/components/ui";

const NAV: { href: string; labelKey: DictKey; icon: string; roles: string[] }[] = [
  { href: "/daysheet", labelKey: "nav.daySheet", icon: "▦", roles: ["STAFF"] },
  { href: "/dashboard", labelKey: "nav.dashboard", icon: "◫", roles: ["STAFF"] },
  { href: "/calendar", labelKey: "nav.calendar", icon: "▤", roles: ["*"] },
  { href: "/bookings", labelKey: "nav.bookings", icon: "≡", roles: ["*"] },
  { href: "/payments", labelKey: "nav.dues", icon: "৳", roles: ["STAFF"] },
  { href: "/guests", labelKey: "nav.guests", icon: "☺", roles: ["STAFF"] },
  { href: "/expenses", labelKey: "nav.expenses", icon: "−", roles: ["STAFF"] },
  { href: "/fb", labelKey: "nav.fb", icon: "☕", roles: ["STAFF"] },
  { href: "/reports", labelKey: "nav.reports", icon: "▨", roles: ["STAFF"] },
  { href: "/rooms", labelKey: "nav.rooms", icon: "⌂", roles: ["MGMT"] },
  { href: "/activities", labelKey: "nav.activities", icon: "◈", roles: ["STAFF"] },
  { href: "/import", labelKey: "nav.import", icon: "↑", roles: ["MGMT"] },
  { href: "/profile", labelKey: "nav.profile", icon: "★", roles: ["AGENT"] },
  { href: "/settings", labelKey: "nav.settings", icon: "⚙", roles: ["MGMT"] },
];

function Shell({ children }: { children: React.ReactNode }) {
  const { me, loading, role, isStaff, isManagement, activeResort, setActiveResort, logout } = useAuth();
  const { lang, setLang } = useLang();
  const t = (k: DictKey) => (lang === "bn" ? k : k);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  useEffect(() => {
    // guests don't get the console — they use the mobile app
    if (!loading && me?.role === "GUEST") router.replace("/login");
  }, [loading, me, router]);

  if (loading || !me || !activeResort) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Loading…
      </div>
    );
  }

  const allowed = (roles: string[]) =>
    roles.includes("*") ||
    (roles.includes("STAFF") && isStaff) ||
    (roles.includes("MGMT") && isManagement);

  return (
    <div className="flex min-h-screen">
      {/* sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 flex w-56 flex-col bg-brand-900 text-white">
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 font-bold">R</div>
          <div>
            <div className="text-sm font-semibold leading-tight">Resort Mela</div>
            <div className="text-[10px] text-brand-200">Admin Console</div>
          </div>
        </div>
        <nav className="mt-2 flex-1 space-y-0.5 overflow-y-auto px-2">
          {NAV.filter((n) => allowed(n.roles)).map((n) => {
            const active = pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                  active ? "bg-white/15 font-medium text-white" : "text-brand-100 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="w-4 text-center opacity-70">{n.icon}</span>
                {lang === "bn" ? BN_NAV[n.labelKey] ?? n.labelKey : EN_NAV[n.labelKey] ?? n.labelKey}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 px-4 py-3">
          <div className="text-xs font-medium text-white">{me.name}</div>
          <div className="text-[10px] text-brand-200">{role.replace(/_/g, " ")}</div>
          <button
            onClick={() => {
              logout();
              router.replace("/login");
            }}
            className="mt-2 text-[11px] text-brand-200 underline-offset-2 hover:text-white hover:underline"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* content */}
      <div className="ml-56 flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-6 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">Resort</span>
            <Select
              className="!w-56"
              value={activeResort.id}
              onChange={(e) => {
                const r = me.resorts.map((x) => x.resort).find((x) => x.id === Number(e.target.value));
                if (r) setActiveResort(r);
              }}
            >
              {me.resorts.map(({ resort }) => (
                <option key={resort.id} value={resort.id}>
                  {resort.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLang(lang === "bn" ? "en" : "bn")}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              {lang === "bn" ? "English" : "বাংলা"}
            </button>
            <div className="text-xs text-slate-400">
              {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </div>
          </div>
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <LangProvider>
      <Shell>{children}</Shell>
    </LangProvider>
  );
}

// nav label maps (kept beside NAV for a zero-abstraction lookup)
const BN_NAV: Record<string, string> = {
  "nav.daySheet": "দিনলিপি",
  "nav.dashboard": "ড্যাশবোর্ড",
  "nav.calendar": "ক্যালেন্ডার",
  "nav.bookings": "বুকিং",
  "nav.dues": "বকেয়া",
  "nav.guests": "অতিথি",
  "nav.expenses": "খরচ",
  "nav.fb": "রেস্টুরেন্ট",
  "nav.reports": "রিপোর্ট",
  "nav.rooms": "রুম ও রেট",
  "nav.activities": "অ্যাক্টিভিটি",
  "nav.import": "ইমপোর্ট",
  "nav.profile": "প্রোফাইল",
  "nav.settings": "সেটিংস",
};
const EN_NAV: Record<string, string> = {
  "nav.daySheet": "Day Sheet",
  "nav.dashboard": "Dashboard",
  "nav.calendar": "Calendar",
  "nav.bookings": "Bookings",
  "nav.dues": "Dues",
  "nav.guests": "Guests",
  "nav.expenses": "Expenses",
  "nav.fb": "Restaurant",
  "nav.reports": "Reports",
  "nav.rooms": "Rooms & Rates",
  "nav.activities": "Activities",
  "nav.import": "Import CSV",
  "nav.profile": "My Profile",
  "nav.settings": "Settings",
};
