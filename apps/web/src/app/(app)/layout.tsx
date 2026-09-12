"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ScrollText, LayoutDashboard, CalendarDays, BedDouble, Wallet, Users, Receipt,
  UtensilsCrossed, BarChart3, Building2, Compass, Upload, User, Settings, Globe,
  Bell, Mail, MapPin as MapIcon, Menu, Banknote, Plus, Package, FileText, Search,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { consoleGate, navVisible, missingFeature } from "@/lib/console-access";
import { planFeatureLabel } from "@rh/shared";
import { LangProvider, useLang, type DictKey } from "@/lib/i18n";
import { api, type Resort } from "@/lib/api";
import { useApi, keys, useQueryClient } from "@/lib/query";
import { OutboxProvider } from "@/lib/outbox";
import { Logo } from "@/components/logo";
import { OutboxBar } from "@/components/outbox-bar";
import { Select, Button, Input, useToast } from "@/components/ui";

/**
 * `perm` is what actually decides visibility now that the API checks the
 * permission matrix rather than the fixed role. Showing a link the server will
 * refuse is worse than hiding it. `roles` remains only for the two audiences a
 * permission cannot describe: the platform team and agents.
 */
const NAV: { href: string; labelKey?: DictKey; label?: string; icon: LucideIcon; roles: string[]; perm?: string; feature?: string }[] = [
  { href: "/platform", label: "Platform", icon: Globe, roles: ["SUPER"] },
  { href: "/agent/discover", label: "Discover resorts", icon: MapIcon, roles: ["AGENT"] },
  { href: "/agent/search", label: "Find a room", icon: Search, roles: ["AGENT"], perm: "agent.book" },
  { href: "/agent/calendar", label: "Calendar", icon: CalendarDays, roles: ["AGENT"], perm: "agent.book" },
  { href: "/agent/tours", label: "Tours", icon: Package, roles: ["AGENT"], perm: "agent.tours.manage" },
  { href: "/agent/sales", label: "Quotes & invoices", icon: FileText, roles: ["AGENT"], perm: "agent.sales.manage" },
  { href: "/agent/guests", label: "Guests", icon: Users, roles: ["AGENT"], perm: "agent.guests.view" },
  { href: "/agent/expenses", label: "Expenses", icon: Receipt, roles: ["AGENT"], perm: "agent.expenses.manage" },
  { href: "/agent/payroll", label: "Payroll", icon: Banknote, roles: ["AGENT"], perm: "agent.payroll.manage" },
  { href: "/agent/wallet", label: "Wallet", icon: Wallet, roles: ["AGENT"], perm: "agent.wallet.view" },
  { href: "/agent/team", label: "My team", icon: Users, roles: ["AGENT"], perm: "agent.staff.manage" },
  { href: "/mailbox", label: "Bulk Email", icon: Mail, roles: ["MGMT", "AGENT"], perm: "marketing.send", feature: "bulk_email" },
  { href: "/daysheet", labelKey: "nav.daySheet", icon: ScrollText, roles: ["STAFF"], perm: "bookings.view" },
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, roles: ["STAFF"], perm: "bookings.view" },
  { href: "/calendar", labelKey: "nav.calendar", icon: CalendarDays, roles: ["*"], perm: "bookings.view" },
  { href: "/bookings", labelKey: "nav.bookings", icon: BedDouble, roles: ["*"], perm: "bookings.view" },
  { href: "/payments", labelKey: "nav.dues", icon: Wallet, roles: ["STAFF"], perm: "payments.view" },
  { href: "/guests", labelKey: "nav.guests", icon: Users, roles: ["STAFF"], perm: "guests.view" },
  { href: "/expenses", labelKey: "nav.expenses", icon: Receipt, roles: ["STAFF"], perm: "expenses.view" },
  { href: "/fb", labelKey: "nav.fb", icon: UtensilsCrossed, roles: ["STAFF"], perm: "restaurant.view", feature: "restaurant" },
  { href: "/payroll", label: "Payroll", icon: Banknote, roles: ["PAYROLL"], perm: "payroll.view", feature: "payroll" },
  { href: "/reports", labelKey: "nav.reports", icon: BarChart3, roles: ["STAFF"], perm: "reports.view" },
  { href: "/rooms", labelKey: "nav.rooms", icon: Building2, roles: ["MGMT"], perm: "rooms.view" },
  { href: "/activities", labelKey: "nav.activities", icon: Compass, roles: ["STAFF"], perm: "activities.view", feature: "activities" },
  { href: "/import", labelKey: "nav.import", icon: Upload, roles: ["MGMT"], perm: "import.run", feature: "imports" },
  { href: "/profile", labelKey: "nav.profile", icon: User, roles: ["AGENT"] },
  { href: "/settings", labelKey: "nav.settings", icon: Settings, roles: ["MGMT"], perm: "settings.manage" },
];

/**
 * Says why a button on this screen is about to refuse.
 *
 * Reached by a typed URL or an old bookmark: the link is gone from the menu,
 * but the screen still opens and still offers its actions. What is already
 * recorded stays readable — a resort's own books are not the platform's to
 * withhold — so this explains rather than blocks.
 */
function NotInPlan({ feature }: { feature: string | null }) {
  if (!feature) return null;
  const label = planFeatureLabel(feature);
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="text-sm font-semibold text-amber-900">{label} is not in this resort&apos;s plan</div>
      {/* the label is printed as written: lower-casing it turned "Restaurant POS
          & room tabs" into "restaurant pos & room tabs" */}
      <p className="mt-0.5 text-xs text-amber-800">
        What is already here stays readable. Adding anything new needs a plan that includes it —
        ask the platform to change the plan.
      </p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { me, loading, role, isStaff, isManagement, activeResort, setActiveResort, logout, isImpersonating, exitImpersonation, can, features } = useAuth();
  const { lang, setLang } = useLang();
  const t = (k: DictKey) => (lang === "bn" ? k : k);
  const router = useRouter();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  const gate = consoleGate({ loading, me, activeResort });

  useEffect(() => {
    // nobody is signed in — `consoleGate` says so before it says anything else
    if (gate === "login") router.replace("/login");
  }, [gate, router]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  if (gate === "loading" || gate === "login" || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Loading…
      </div>
    );
  }

  /**
   * Locked out, not loading.
   *
   * Staff whose resort link was removed used to sit on the spinner above for
   * ever, with nothing on the screen naming the problem or suggesting a way out.
   */
  if (gate === "no-resort") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-sm font-semibold text-slate-700">
          Your account is not attached to a resort
        </div>
        <p className="max-w-sm text-xs text-slate-500">
          Ask the resort owner to add you again from Settings → Team. Until they do, there is
          nothing here for you to open.
        </p>
        <button
          onClick={logout}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          Sign out
        </button>
      </div>
    );
  }

  // a link the server would refuse should not be on screen — whether it would
  // refuse on the permission or on the plan
  const allowed = (n: { roles: string[]; perm?: string; feature?: string }) =>
    navVisible(n, { role, can, features });

  return (
    <div className="flex min-h-screen flex-col">
      {isImpersonating && (
        <div className="flex items-center justify-center gap-3 bg-amber-400 px-4 py-1.5 text-xs font-semibold text-amber-950">
          Viewing as <b>{me?.name}</b> ({role.replace(/_/g, " ")}). Actions are audited.
          <button onClick={exitImpersonation} className="rounded-full bg-amber-950 px-3 py-1 text-[11px] font-bold text-amber-100 hover:bg-amber-900">
            Exit to Super Admin
          </button>
        </div>
      )}
      <div className="flex min-h-screen flex-1">
      {/* mobile backdrop */}
      {navOpen && <div className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={() => setNavOpen(false)} />}
      {/* sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-brand-900 text-white transition-transform duration-200 lg:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="px-4 py-4">
          <Logo size={32} tone="onDark" sub="Admin Console" />
        </div>
        <nav className="mt-2 flex-1 space-y-0.5 overflow-y-auto px-2">
          {NAV.filter(allowed).map((n) => {
            const active = pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                  active ? "bg-white/15 font-medium text-white" : "text-brand-100 hover:bg-white/10 hover:text-white"
                }`}
              >
                <n.icon className="h-4 w-4 opacity-70" strokeWidth={1.75} />
                {n.label ?? (n.labelKey ? (lang === "bn" ? BN_NAV[n.labelKey] ?? n.labelKey : EN_NAV[n.labelKey] ?? n.labelKey) : n.href)}
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
      <div className="flex min-h-screen flex-1 flex-col lg:ml-60">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-slate-200 bg-white/90 px-3 py-3 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => setNavOpen(true)}
              className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 lg:hidden"
              title="Menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            {/* the platform owner's sidebar has no resort screens in it, so a
                switcher here would change nothing they can see */}
            {activeResort && role !== "SUPER_ADMIN" && (
              <>
            <span className="hidden text-xs text-slate-400 sm:inline">Resort</span>
            <Select
              className="!w-40 max-w-[45vw] sm:!w-56"
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
              </>
            )}
            {role === "RESORT_ADMIN" && <AddResortButton />}
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button
              onClick={() => setLang(lang === "bn" ? "en" : "bn")}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              {lang === "bn" ? "English" : "বাংলা"}
            </button>
            <div className="hidden text-xs text-slate-400 xl:block">
              {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </div>
          </div>
        </header>
        <OutboxBar />
        <main className="flex-1 px-3 py-4 sm:px-6 sm:py-6">
          {/* an agency's standing with the platform: it can look around, but not sell */}
          {me?.account && me.account.status !== "active" && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {me.account.status === "pending"
                ? "Your agency is waiting for Resort Mela to verify it. You can look around, but you cannot make bookings until it is verified — once, for every resort."
                : me.account.suspendedReason === "billing"
                  ? "Your agency's account is suspended for an unpaid bill, so you cannot make new bookings. Bookings you have already made are unaffected."
                  : "Your agency's account is suspended, so you cannot make new bookings. Bookings you have already made are unaffected."}
            </div>
          )}
          <NotInPlan feature={missingFeature(pathname, NAV, features)} />
          {children}
        </main>
      </div>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <LangProvider>
      <OutboxProvider>
        <Shell>{children}</Shell>
      </OutboxProvider>
    </LangProvider>
  );
}

interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  kind: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  /**
   * The bell polls, but only while someone is looking.
   *
   * The old setInterval kept firing in a tab left open overnight on a metered
   * connection — 1,440 requests to tell a closed laptop nothing happened.
   * refetchIntervalInBackground defaults to false, so a hidden tab stops.
   */
  const notifQ = useApi(
    keys.notifications(),
    () => api<{ unread: number; rows: NotificationRow[] }>("/notifications"),
    { refetchInterval: 60_000, staleTime: 30_000 },
  );
  const rows: NotificationRow[] = notifQ.data?.rows ?? [];
  const unread = notifQ.data?.unread ?? 0;

  const load = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: keys.notifications() });
  }, [qc]);

  async function openPanel() {
    setOpen((o) => !o);
    if (!open) {
      void load();
      if (unread > 0) {
        // clear the badge straight away, then let the refetch confirm it
        qc.setQueryData(keys.notifications(), (prev: { unread: number; rows: NotificationRow[] } | undefined) =>
          prev ? { ...prev, unread: 0 } : prev,
        );
        await api("/notifications/read", { method: "POST", body: {} }).catch(() => {});
        void load();
      }
    }
  }

  return (
    <div className="relative">
      <button onClick={openPanel} className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Notifications">
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <div className="text-sm font-bold text-slate-800">Notifications</div>
            <button onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-slate-700">Close</button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {rows.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-400">Nothing yet</div>}
            {rows.map((n) => {
              const inner = (
                <div className={`border-b border-slate-50 px-4 py-3 ${n.readAt ? "" : "bg-brand-50/40"}`}>
                  <div className="flex items-start gap-2">
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${n.kind === "alert" ? "bg-red-400" : n.kind === "request" ? "bg-amber-400" : n.kind === "booking" ? "bg-emerald-400" : "bg-slate-300"}`} />
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{n.title}</div>
                      {n.body && <div className="mt-0.5 text-xs text-slate-500">{n.body}</div>}
                      <div className="mt-1 text-[10px] text-slate-400">{new Date(n.createdAt).toLocaleString("en-GB")}</div>
                    </div>
                  </div>
                </div>
              );
              return n.link ? (
                <a key={n.id} href={n.link} onClick={() => setOpen(false)} className="block hover:bg-slate-50">{inner}</a>
              ) : (
                <div key={n.id}>{inner}</div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// nav label maps (kept beside NAV for a zero-abstraction lookup)

function AddResortButton() {
  const { me, setActiveResort } = useAuth();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  if (!me || me.resorts.length === 0) return null;
  const tenantId = me.resorts[0]!.resort.tenantId;

  async function create() {
    setBusy(true);
    try {
      const r = await api<Resort>(`/tenants/${tenantId}/resorts`, { method: "POST", body: { name } });
      // full membership list may lag — add it optimistically from the response
      setActiveResort({ id: r.id, name: r.name, tenantId: r.tenantId, status: (r as unknown as { status?: string }).status ?? "active" });
      window.location.href = "/";
    } catch (ex) {
      push((ex as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Add another resort"
        className="rounded-lg border border-brand-300 p-1.5 text-brand-700 hover:bg-brand-50"
      >
        <Plus className="h-4 w-4" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-lg font-bold text-slate-900">Add another resort</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New resort name" />
            <p className="mt-2 text-xs text-slate-500">Allowed by your subscription plan — extra resorts share the same login.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={create} loading={busy} disabled={!name.trim()}>Create resort</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

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
