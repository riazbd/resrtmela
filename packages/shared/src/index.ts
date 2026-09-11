export * from "./api-types";
export * from "./client";

/** Cross-app constants shared by api, web and mobile. */

export const ROLE = {
  SUPER_ADMIN: "SUPER_ADMIN",
  RESORT_ADMIN: "RESORT_ADMIN",
  MANAGER: "MANAGER",
  FRONT_DESK: "FRONT_DESK",
  AGENT: "AGENT",
  HOUSEKEEPING: "HOUSEKEEPING",
} as const;
export type RoleKey = (typeof ROLE)[keyof typeof ROLE];
export type Role = RoleKey;

export const BOOKING_STATE_COLORS: Record<string, string> = {
  CONFIRMED: "#15803d", // green   — matches sheet convention
  CANCELLED: "#dc2626", // red
  NO_SHOW: "#92400e", // brown
};

export const PAYMENT_STATE_COLORS: Record<string, string> = {
  PARTIAL: "#ea580c", // orange — partial payment marker in sheet
  UNPAID: "#991b1b",
  PAID: "#166534",
};

export const SOURCE_LABELS: Record<string, string> = {
  DIRECT: "Direct",
  AGENT: "Agent",
  FACEBOOK: "Facebook",
  WHATSAPP: "WhatsApp",
  PHONE: "Phone Call",
  APP: "Mobile App",
};

export const BOOKING_CODE_PREFIX = "BK";
export const MONEY_DECIMALS = 2;

// ───────────────────────── Placeholder contact values ─────────────────────────

/**
 * The placeholders, defined once for every app that reads or writes them.
 *
 * Every account has both an email and a phone (the owner's ruling,
 * 2026-09-11); migration 20260911130000 gave every account missing one a
 * placeholder — `user-<id>@placeholder.invalid` for email,
 * `placeholder-<id>` for phone — so both columns could be required. SQL
 * cannot import this, so the migration spells the same two shapes out by
 * hand; everything else, in the API and in the console, asks here instead.
 * They are gaps wearing a value: `.invalid` never delivers, and
 * `placeholder-<id>` is not a phone number.
 */
export const PLACEHOLDER_EMAIL_SUFFIX = "@placeholder.invalid";
export const PLACEHOLDER_PHONE_PREFIX = "placeholder-";

export function isPlaceholderEmail(value: string | null | undefined): boolean {
  return !!value && value.trim().toLowerCase().endsWith(PLACEHOLDER_EMAIL_SUFFIX);
}

export function isPlaceholderPhone(value: string | null | undefined): boolean {
  return !!value && value.trim().toLowerCase().startsWith(PLACEHOLDER_PHONE_PREFIX);
}

export interface JwtClaims {
  userId: number;
  role: RoleKey;
  resortIds: number[];
}

// ───────────────────────── Permission matrix (Paradox-style) ─────────────────────────

export const PERMISSIONS: { key: string; label: string; group: string }[] = [
  { key: "bookings.view", label: "View bookings & calendar", group: "Bookings" },
  { key: "bookings.create", label: "Create bookings", group: "Bookings" },
  { key: "bookings.edit", label: "Edit / check-in / check-out", group: "Bookings" },
  { key: "bookings.cancel", label: "Cancel bookings", group: "Bookings" },
  { key: "bookings.walkin", label: "Walk-in customers", group: "Bookings" },
  { key: "bookings.delete", label: "Delete bookings from the books", group: "Bookings" },
  { key: "payments.view", label: "View payments & dues", group: "Money" },
  { key: "payments.create", label: "Record payments", group: "Money" },
  { key: "expenses.view", label: "View expenses", group: "Money" },
  { key: "expenses.create", label: "Record expenses", group: "Money" },
  { key: "expenses.delete", label: "Delete expenses", group: "Money" },
  { key: "rooms.view", label: "View rooms & rates", group: "Inventory" },
  { key: "rooms.manage", label: "Manage rooms, types & rates", group: "Inventory" },
  { key: "rooms.delete", label: "Remove rooms from the inventory", group: "Inventory" },
  { key: "guests.view", label: "View guests", group: "Inventory" },
  { key: "restaurant.view", label: "View restaurant bills", group: "Restaurant" },
  { key: "restaurant.create", label: "Create restaurant bills (POS)", group: "Restaurant" },
  { key: "restaurant.menu", label: "Manage food packages", group: "Restaurant" },
  { key: "restaurant.delete", label: "Delete restaurant bills", group: "Restaurant" },
  { key: "agents.view", label: "View agents", group: "Agents" },
  { key: "agents.manage", label: "Activate agents, invite, commission", group: "Agents" },
  { key: "reports.view", label: "View reports", group: "Reports" },
  { key: "reports.pl", label: "View profit & loss", group: "Reports" },
  { key: "payroll.view", label: "View payroll", group: "Payroll" },
  { key: "payroll.manage", label: "Manage staff & salary payments", group: "Payroll" },
  { key: "activities.view", label: "View activities", group: "Activities" },
  { key: "activities.manage", label: "Manage activities, schedules & slots", group: "Activities" },
  { key: "auditlog.view", label: "View the activity log", group: "Admin" },
  { key: "auditlog.delete", label: "Delete activity log entries", group: "Admin" },
  { key: "discounts.manage", label: "Manage discount offers", group: "Admin" },
  { key: "users.manage", label: "Manage users", group: "Admin" },
  { key: "roles.manage", label: "Manage roles & permissions", group: "Admin" },
  { key: "settings.manage", label: "Resort settings", group: "Admin" },
  { key: "apikeys.manage", label: "API keys", group: "Admin" },
  { key: "billing.view", label: "See the subscription & bills", group: "Admin" },
  { key: "billing.manage", label: "Change the subscription plan", group: "Admin" },
  { key: "import.run", label: "Import data from spreadsheets", group: "Admin" },
  { key: "export.run", label: "Export the resort's data", group: "Admin" },
  { key: "marketing.send", label: "Buy email credits & send campaigns", group: "Admin" },
  // agent portal
  { key: "agent.book", label: "Book for guests", group: "Agent portal" },
  { key: "agent.wallet.view", label: "See the agency wallet", group: "Agent portal" },
  { key: "agent.staff.manage", label: "Add & manage agency staff", group: "Agent portal" },
  { key: "agent.auditlog.view", label: "See the agency activity log", group: "Agent portal" },
  { key: "agent.tours.manage", label: "Build tour packages", group: "Agent portal" },
  { key: "agent.expenses.manage", label: "Keep the agency's expenses", group: "Agent portal" },
  { key: "agent.payroll.manage", label: "Run the agency's payroll", group: "Agent portal" },
  { key: "agent.sales.manage", label: "Quotations & invoices", group: "Agent portal" },
  { key: "agent.guests.view", label: "See every guest the agency has served", group: "Agent portal" },
];

/**
 * What an agency may hand to its own staff.
 *
 * Deliberately a short list. An agency is a customer of the platform, not an
 * administrator of it, so nothing here reaches a resort's own settings, money
 * or people — an agency role that could grant `payroll.manage` would be a
 * privilege escalation dressed as a feature.
 */
export const AGENT_PERMISSIONS = [
  "agent.book",
  "agent.wallet.view",
  "agent.staff.manage",
  "agent.auditlog.view",
  "agent.tours.manage",
  "agent.expenses.manage",
  "agent.payroll.manage",
  "agent.sales.manage",
  "agent.guests.view",
  "marketing.send",
] as const;

export function isAgentPermission(key: string): boolean {
  return (AGENT_PERMISSIONS as readonly string[]).includes(key);
}

export const ALL_PERMISSIONS = PERMISSIONS.map((p) => p.key);

const PERMISSION_SET = new Set(ALL_PERMISSIONS);

export function isPermissionKey(key: string): boolean {
  return PERMISSION_SET.has(key);
}

export const PERMISSION_GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))];

/**
 * What a plan can include — the platform's shelf.
 *
 * The pricing page used to carry these as a hardcoded map keyed by plan name,
 * so a plan the owner created showed no features at all and no line on any card
 * gated anything: a Starter customer whose card never mentioned the restaurant
 * could open the restaurant. They are one list now, and the same list does
 * three jobs — the ticks on the public card, the checkboxes in the platform
 * panel, and the lock the API checks.
 *
 * Declared in code, chosen per plan in the database. That split is deliberate
 * and matches PERMISSIONS above: a key the code has never heard of cannot gate
 * anything, so letting the owner invent one would sell a lock with no door. The
 * owner composes plans freely from this shelf; adding to the shelf is a
 * developer's job because it means writing the gate as well.
 */
export const PLAN_FEATURES = [
  { key: "restaurant", label: "Restaurant POS & room tabs", blurb: "Sell food and drink, and put it on the room" },
  { key: "agents", label: "Agents with wallets", blurb: "Travel agents book for you, on commission" },
  { key: "activities", label: "Activities & tours", blurb: "Sell trips and rides alongside the room" },
  { key: "discounts", label: "Discount & offer engine", blurb: "Seasonal rates, offers and coupon rules" },
  { key: "bulk_email", label: "Bulk guest email", blurb: "Write to your whole guest list at once" },
  // `public_api` sold the resort-website `/v1` API, which this branch removed
  // (see migration 20260911120000_a_feature_that_is_gone). The api_keys table
  // and its management endpoints stayed for a possible future integration,
  // but a feature nothing implements does not belong on the shelf: the next
  // edit of any plan still listing it would fail `isPlanFeature` validation
  // for a reason nobody reading the panel could act on.
  { key: "payroll", label: "Staff & payroll", blurb: "Employees, salaries and payslips" },
  { key: "imports", label: "Spreadsheet import", blurb: "Bring old bookings and books in from Excel" },
] as const;

export type PlanFeatureKey = (typeof PLAN_FEATURES)[number]["key"];

export const ALL_PLAN_FEATURES: string[] = PLAN_FEATURES.map((f) => f.key);

const PLAN_FEATURE_SET = new Set(ALL_PLAN_FEATURES);

export function isPlanFeature(key: string): boolean {
  return PLAN_FEATURE_SET.has(key);
}

export function planFeatureLabel(key: string): string {
  return PLAN_FEATURES.find((f) => f.key === key)?.label ?? key;
}

/** Defaults for the seeded system roles, keyed by role name */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  Administrator: ALL_PERMISSIONS,
  Manager: [
    "bookings.view", "bookings.create", "bookings.edit", "bookings.cancel", "bookings.walkin",
    "payments.view", "payments.create", "expenses.view", "expenses.create",
    "rooms.view", "rooms.manage", "guests.view",
    "restaurant.view", "restaurant.create", "restaurant.menu",
    "agents.view", "agents.manage", "reports.view", "reports.pl",
    "payroll.view", "payroll.manage",
    "activities.view", "activities.manage",
    "auditlog.view", "discounts.manage",
    "bookings.delete", "expenses.delete", "restaurant.delete",
    "import.run", "export.run", "marketing.send", "users.manage", "settings.manage",
    "billing.view",
  ],
  "Front Desk": [
    "bookings.view", "bookings.create", "bookings.edit", "bookings.walkin",
    "payments.view", "payments.create", "rooms.view", "guests.view",
    "restaurant.view", "restaurant.create", "activities.view",
  ],
  Agent: ["agent.book", "agent.wallet.view"],
  "Agency owner": [...AGENT_PERMISSIONS],
};


// ───────────────────────── Money formatting ─────────────────────────

/**
 * Currency and locale belong to the tenant, not to the binary.
 *
 * `narrowSymbol` is what keeps ৳ rather than the "BDT" ICU otherwise prints
 * for Bangla taka, and it gives $ and ₹ for the currencies a second tenant
 * might use — one rule, no symbol table to maintain.
 *
 * The defaults reproduce exactly what the console rendered when the taka sign
 * was hard-coded, so existing tenants see no change. en-IN rather than en-BD
 * is deliberate: Bangladesh groups in lakh and crore, and ICU's en-BD does not.
 */
export const DEFAULT_CURRENCY = "BDT";
export const DEFAULT_LOCALE = "en-IN";

export interface MoneyFormat {
  currency?: string;
  locale?: string;
  /** fraction digits; 0 for compact displays like stat tiles */
  decimals?: number;
}

export function formatMoney(
  amount: number | string | null | undefined,
  format: MoneyFormat = {},
): string {
  const n = amount == null || amount === "" ? 0 : Number(amount);
  const value = Number.isFinite(n) ? n : 0;
  const currency = format.currency || DEFAULT_CURRENCY;
  const locale = format.locale || DEFAULT_LOCALE;
  const decimals = format.decimals ?? 2;

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    // an unknown currency or malformed locale must not blank out a screen
    try {
      return `${currency} ${value.toLocaleString(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}`;
    } catch {
      return `${currency} ${value.toFixed(decimals)}`;
    }
  }
}

/** Just the symbol — for field labels like "Base rate (৳/night)". */
export function currencySymbol(format: MoneyFormat = {}): string {
  try {
    return (
      new Intl.NumberFormat(format.locale || DEFAULT_LOCALE, {
        style: "currency",
        currency: format.currency || DEFAULT_CURRENCY,
        currencyDisplay: "narrowSymbol",
      })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? (format.currency || DEFAULT_CURRENCY)
    );
  } catch {
    return format.currency || DEFAULT_CURRENCY;
  }
}
