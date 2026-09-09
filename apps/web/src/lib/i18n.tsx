"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * Bangla first, in the places a Bangladeshi front desk actually reads.
 *
 * "Bangla-first" was a claim backed by 68 keys on four screens. The words that
 * matter most were still English: the state of a booking, the button that
 * takes a guest's money, and — worst — the message shown when something breaks
 * at 11pm in Sajek and nobody senior is awake.
 *
 * The typing is deliberate: DictKey comes from the English dictionary, and the
 * Bangla one must satisfy the same keys, so a translation that is added to one
 * and forgotten in the other fails the build rather than falling back silently
 * in front of a customer.
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

    // ── the words every screen uses ──
    "c.save": "সংরক্ষণ",
    "c.cancel": "বাতিল",
    "c.delete": "মুছে ফেলুন",
    "c.edit": "সম্পাদনা",
    "c.add": "যোগ করুন",
    "c.search": "খুঁজুন",
    "c.from": "শুরু",
    "c.to": "শেষ",
    "c.total": "মোট",
    "c.amount": "টাকা",
    "c.date": "তারিখ",
    "c.name": "নাম",
    "c.phone": "মোবাইল",
    "c.status": "অবস্থা",
    "c.actions": "কাজ",
    "c.loading": "লোড হচ্ছে…",
    "c.none": "কিছু নেই",
    "c.staffOnly": "শুধু স্টাফের জন্য",
    "c.retry": "আবার চেষ্টা করুন",
    "c.saved": "সংরক্ষিত হয়েছে",
    "c.confirmDelete": "এটি মুছে ফেলবেন?",

    // ── booking states, as a front desk says them ──
    "st.PENDING": "অপেক্ষমাণ",
    "st.CONFIRMED": "নিশ্চিত",
    "st.CHECKED_IN": "চেক-ইন",
    "st.CHECKED_OUT": "চেক-আউট",
    "st.CANCELLED": "বাতিল",
    "st.NO_SHOW": "আসেনি",
    "st.UNPAID": "বাকি",
    "st.PARTIAL": "আংশিক",
    "st.PAID": "পরিশোধিত",

    // ── bookings ──
    "bk.title": "বুকিং",
    "bk.new": "নতুন বুকিং",
    "bk.code": "বুকিং নম্বর",
    "bk.stay": "অবস্থান",
    "bk.rooms": "রুম",
    "bk.source": "উৎস",
    "bk.payment": "পেমেন্ট",
    "bk.checkIn": "চেক-ইন",
    "bk.checkOut": "চেক-আউট",
    "bk.adults": "প্রাপ্তবয়স্ক",
    "bk.children": "শিশু",
    "bk.discount": "ছাড়",
    "bk.advance": "অগ্রিম",
    "bk.nights": "রাত",
    "bk.rent": "ভাড়া",
    "bk.none": "কোনো বুকিং মেলেনি",

    // ── money ──
    "pay.title": "বকেয়া",
    "pay.collect": "টাকা নিন",
    "pay.method": "মাধ্যম",
    "pay.outstanding": "মোট বকেয়া",
    "pay.withDues": "বকেয়াসহ বুকিং",
    "pay.received": "গ্রহণ করেছেন",
    "ex.title": "খরচ",
    "ex.category": "খাত",
    "ex.details": "বিবরণ",
    "ex.dayTotal": "আজকের মোট খরচ",
    "ex.none": "এই দিনে কোনো খরচ নেই",

    // ── guests & restaurant ──
    "g.title": "অতিথি তালিকা",
    "g.searchHint": "নাম বা মোবাইল দিয়ে খুঁজুন…",
    "g.bookings": "বুকিং সংখ্যা",
    "g.lastStay": "সর্বশেষ অবস্থান",
    "g.none": "কোনো অতিথি পাওয়া যায়নি",
    "fb.title": "রেস্টুরেন্ট",
    "fb.inHouse": "রুমে থাকা / ওয়াক-ইন",
    "fb.walkIn": "ওয়াক-ইন অতিথি",
    "fb.bill": "বিল",
    "fb.item": "আইটেম",
    "fb.qty": "পরিমাণ",
    "fb.rate": "দর",
    "fb.chargeToRoom": "রুমে যোগ করুন",
    "fb.none": "এই সময়ে কোনো বিল নেই",

    // ── errors, in the words of someone at the desk ──
    "err.title": "কিছু একটা ভুল হয়েছে",
    "err.offline": "ইন্টারনেট সংযোগ নেই",
    "err.offlineHint": "সংযোগ ফিরে এলে আবার চেষ্টা করুন। সংরক্ষিত তথ্য হারায়নি।",
    "err.forbidden": "এই পাতাটি দেখার অনুমতি নেই",
    "err.notFound": "পাতাটি খুঁজে পাওয়া যায়নি",
    "err.reference": "সাপোর্টে যোগাযোগ করলে এই কোডটি বলুন",
    "err.suspended": "সাবস্ক্রিপশন বকেয়া থাকায় নতুন এন্ট্রি বন্ধ আছে। পুরনো তথ্য পড়া ও ডাউনলোড করা যাবে।",
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

    // ── the words every screen uses ──
    "c.save": "Save",
    "c.cancel": "Cancel",
    "c.delete": "Delete",
    "c.edit": "Edit",
    "c.add": "Add",
    "c.search": "Search",
    "c.from": "From",
    "c.to": "To",
    "c.total": "Total",
    "c.amount": "Amount",
    "c.date": "Date",
    "c.name": "Name",
    "c.phone": "Phone",
    "c.status": "Status",
    "c.actions": "Actions",
    "c.loading": "Loading…",
    "c.none": "Nothing here",
    "c.staffOnly": "Staff only",
    "c.retry": "Try again",
    "c.saved": "Saved",
    "c.confirmDelete": "Delete this?",

    // ── booking states, as a front desk says them ──
    "st.PENDING": "Pending",
    "st.CONFIRMED": "Confirmed",
    "st.CHECKED_IN": "Checked in",
    "st.CHECKED_OUT": "Checked out",
    "st.CANCELLED": "Cancelled",
    "st.NO_SHOW": "No show",
    "st.UNPAID": "Unpaid",
    "st.PARTIAL": "Partial",
    "st.PAID": "Paid",

    // ── bookings ──
    "bk.title": "Bookings",
    "bk.new": "New booking",
    "bk.code": "Code",
    "bk.stay": "Stay",
    "bk.rooms": "Rooms",
    "bk.source": "Source",
    "bk.payment": "Payment",
    "bk.checkIn": "Check-in",
    "bk.checkOut": "Check-out",
    "bk.adults": "Adults",
    "bk.children": "Children",
    "bk.discount": "Discount",
    "bk.advance": "Advance",
    "bk.nights": "Nights",
    "bk.rent": "Rent",
    "bk.none": "No bookings match",

    // ── money ──
    "pay.title": "Dues",
    "pay.collect": "Collect payment",
    "pay.method": "Method",
    "pay.outstanding": "Total outstanding",
    "pay.withDues": "Bookings with dues",
    "pay.received": "Received by",
    "ex.title": "Expenses",
    "ex.category": "Category",
    "ex.details": "Details",
    "ex.dayTotal": "Total for the day",
    "ex.none": "No entries for this day",

    // ── guests & restaurant ──
    "g.title": "Guest directory",
    "g.searchHint": "Search name or phone…",
    "g.bookings": "Bookings",
    "g.lastStay": "Last stay",
    "g.none": "No guests found",
    "fb.title": "Restaurant",
    "fb.inHouse": "In-house / walk-in",
    "fb.walkIn": "Walk-in guest",
    "fb.bill": "Bill",
    "fb.item": "Item",
    "fb.qty": "Qty",
    "fb.rate": "Rate",
    "fb.chargeToRoom": "Charge to room",
    "fb.none": "No bills in this period",

    // ── errors, in the words of someone at the desk ──
    "err.title": "Something went wrong",
    "err.offline": "No internet connection",
    "err.offlineHint": "Try again when the connection is back. Nothing saved has been lost.",
    "err.forbidden": "You do not have access to this page",
    "err.notFound": "This page does not exist",
    "err.reference": "Quote this code if you contact support",
    "err.suspended": "New entries are paused while the subscription is unpaid. Existing records stay readable and downloadable.",
  },
} as const;

export type Lang = keyof typeof DICTS;
export type DictKey = keyof (typeof DICTS)["en"];

/** Every English key must exist in Bangla. A gap is a compile error, not a fallback. */
const _completeness: Record<DictKey, string> = DICTS.bn;
void _completeness;

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

/** True when the key is one the dictionaries actually carry. */
export function isStateKey(key: string): key is DictKey {
  return key in DICTS.en;
}

export function useT() {
  const { lang } = useLang();
  return useCallback(
    (key: DictKey) => DICTS[lang][key] ?? DICTS.en[key] ?? key,
    [lang],
  );
}
