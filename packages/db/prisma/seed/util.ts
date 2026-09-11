/**
 * Shared machinery for the demo world.
 *
 * Everything random here is deterministic: the same seed builds the same
 * resort, the same guests and the same books every time, so a screenshot taken
 * today still matches the data next week, and two people describing a bug are
 * describing the same booking.
 */
import { createHash, randomUUID } from "node:crypto";

/** A small linear congruential generator — repeatable, and good enough for demo data. */
export function rng(seed = 20260911) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

export type Rand = ReturnType<typeof rng>;

export const pick = <T>(r: Rand, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
export const between = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
export const chance = (r: Rand, pct: number) => r() * 100 < pct;
export const money = (n: number) => Math.round(n * 100) / 100;

/** Midnight UTC — the convention every `@db.Date` column in this schema uses. */
export function day(offset = 0, from = new Date()): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

/** A timestamp on a day, for things that happen at a time rather than on a date. */
export function at(offsetDays: number, hour = 10, minute = 0): Date {
  const d = day(offsetDays);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const monthKey = (d: Date) => d.toISOString().slice(0, 7);
export const nightsBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);

/**
 * The same key the API computes, so the console finds these guests instead of
 * making second copies of them the first time somebody books a returning guest.
 */
export const phoneKeyOf = (normalizedPhone: string) =>
  createHash("sha256").update(normalizedPhone).digest("hex");

export const anonGuestKey = () => createHash("sha256").update("anon:" + randomUUID()).digest("hex");

/** Bangladeshi mobile numbers, stored the way login reads them. */
export function phone(seq: number, prefix = "88017"): string {
  return prefix + String(seq).padStart(7, "0");
}

export const BD_NAMES = [
  "Md. Rahmatullah", "Farhana Akter", "Tanvir Hasan", "Nusrat Jahan", "Shahriar Kabir",
  "Mst. Rokeya Begum", "Imran Hossain", "Sadia Afrin", "Abdul Karim", "Jannatul Ferdous",
  "Rafiqul Islam", "Mehnaz Sultana", "Kamrul Ahsan", "Sabrina Yeasmin", "Golam Mostafa",
  "Nabila Rahman", "Shafiqur Rahman", "Tahmina Khatun", "Mizanur Rahman", "Rubaiya Haque",
  "Arif Mahmud", "Sharmin Akhter", "Delwar Hossain", "Ishrat Jahan", "Masud Parvez",
  "Suraiya Parvin", "Nazmul Huda", "Tania Islam", "Habibur Rahman", "Lamia Chowdhury",
  "Zahid Hasan", "Marzia Sultana", "Anisur Rahman", "Rehnuma Tasnim", "Saiful Alam",
  "Afsana Mimi", "Mahbub Alam", "Rumana Akter", "Jahangir Alam", "Shirin Sultana",
] as const;

export const FOOD_ITEMS = [
  ["Beef tehari", 280], ["Chicken curry", 240], ["Rui fish curry", 320], ["Mixed vegetables", 140],
  ["Plain rice", 60], ["Paratha", 25], ["Omelette", 70], ["Mineral water 1L", 30],
  ["Tea", 25], ["Coffee", 60], ["Fried rice", 260], ["Prawn masala", 520],
  ["Chicken fry", 180], ["Dal", 90], ["Salad", 80], ["Borhani", 70],
  ["Firni", 110], ["Ice cream", 120], ["Lachchi", 90], ["Grilled fish", 480],
] as const;

/** The tables this seed empties, children before parents. */
export const TABLES_IN_WIPE_ORDER = [
  "sales_doc_items", "sales_docs", "tour_package_items", "tour_packages", "tour_categories",
  "payroll_payments", "employees", "expense_heads", "expenses",
  "fb_bill_items", "fb_bills",
  "payment_intents", "payments",
  "booking_nights", "booking_items", "bookings",
  "activity_slots", "activity_schedules", "activity_catalog",
  "notification_jobs", "notifications", "audit_log",
  "email_campaigns", "email_credit_orders", "email_credits", "platform_charges",
  "wallet_txns", "wallets",
  "api_keys", "discount_offers", "message_templates", "food_packages",
  "rate_plans", "booking_nights", "rooms", "room_types",
  "tax_rules", "resort_options", "counters",
  "resort_access", "user_resorts", "roles",
  "guests",
  "subscription_dues", "subscriptions",
  "password_resets", "agent_roles",
  "resort_agencies", "resorts",
  "users", "tenants", "offers",
  "platform_plans", "platform_settings", "cms_settings",
] as const;
