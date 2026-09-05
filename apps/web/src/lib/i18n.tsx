"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * Bangla-first bilingual scaffold. Day Sheet + nav are translated; the rest of
 * the app falls back to English until its keys land here (R1 scope).
 */
export const DICTS = {
  bn: {
    "nav.daySheet": "দিনলিপি",
    "nav.dashboard": "ড্যাশবোর্ড",
    "nav.calendar": "ক্যালেন্ডার",
    "nav.bookings": "বুকিং",
    "nav.dues": "বকেয়া",
    "nav.guests": "অতিথি",
    "nav.expenses": "খরচ",
    "nav.fb": "রেস্টুরেন্ট",
    "nav.rooms": "রুম ও রেট",
    "nav.activities": "অ্যাক্টিভিটি",
    "nav.import": "ইমপোর্ট",
    "nav.reports": "রিপোর্ট",
    "nav.profile": "প্রোফাইল",
    "nav.settings": "সেটিংস",

    "ds.title": "দিনলিপি",
    "ds.subtitle": "প্রতিদিনের হিসাব — বুকিং থেকে স্বয়ংক্রিয়ভাবে গণনা করা",
    "ds.room": "রুম",
    "ds.guest": "অতিথি",
    "ds.due": "বাকি",
    "ds.revenue": "রাতের আয়",
    "ds.today": "আজ",
    "ds.available": "খালি",
    "ds.booked": "বুকড",
    "ds.oos": "বন্ধ",
    "ds.arrives": "আজ আসছে",
    "ds.departs": "আজ ছাড়ছে",
    "ds.balanceDue": "আজকের মোট বাকি",
    "ds.nightRevenue": "আজকের আয়",
    "ds.expenses": "আজকের খরচ",
    "ds.occupancy": "ভর্তি রুম",
    "ds.arrivals": "আগমন",
    "ds.departures": "বিদায়",
    "ds.pax": "জন",
    "ds.empty": "কোনো বুকিং নেই",
  },
  en: {
    "nav.daySheet": "Day Sheet",
    "nav.dashboard": "Dashboard",
    "nav.calendar": "Calendar",
    "nav.bookings": "Bookings",
    "nav.dues": "Dues",
    "nav.guests": "Guests",
    "nav.expenses": "Expenses",
    "nav.fb": "Restaurant",
    "nav.rooms": "Rooms & Rates",
    "nav.activities": "Activities",
    "nav.import": "Import CSV",
    "nav.reports": "Reports",
    "nav.profile": "My Profile",
    "nav.settings": "Settings",

    "ds.title": "Day Sheet",
    "ds.subtitle": "The daily register — computed from bookings, never typed",
    "ds.room": "Room",
    "ds.guest": "Guest",
    "ds.due": "Due",
    "ds.revenue": "Night revenue",
    "ds.today": "Today",
    "ds.available": "Available",
    "ds.booked": "Booked",
    "ds.oos": "Out of service",
    "ds.arrives": "Arrives today",
    "ds.departs": "Departs today",
    "ds.balanceDue": "Balance due (today)",
    "ds.nightRevenue": "Revenue (today)",
    "ds.expenses": "Expenses (today)",
    "ds.occupancy": "Rooms occupied",
    "ds.arrivals": "Arrivals",
    "ds.departures": "Departures",
    "ds.pax": "pax",
    "ds.empty": "No booking",
  },
} as const;

export type Lang = keyof typeof DICTS;
export type DictKey = keyof (typeof DICTS)["en"];

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void } | null>(null);

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("bn");

  useEffect(() => {
    const saved = window.localStorage.getItem("rh.lang");
    if (saved === "en" || saved === "bn") setLangState(saved);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    window.localStorage.setItem("rh.lang", l);
  }, []);

  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

export function useLang() {
  const ctx = useContext(Ctx);
  if (!ctx) return { lang: "en" as Lang, setLang: () => {} };
  return ctx;
}

export function useT() {
  const { lang } = useLang();
  return useCallback(
    (key: DictKey) => DICTS[lang][key] ?? DICTS.en[key] ?? key,
    [lang],
  );
}
