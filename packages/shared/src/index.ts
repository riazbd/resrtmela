/** Cross-app constants shared by api, web and mobile. */

export const ROLE = {
  SUPER_ADMIN: "SUPER_ADMIN",
  RESORT_ADMIN: "RESORT_ADMIN",
  MANAGER: "MANAGER",
  FRONT_DESK: "FRONT_DESK",
  AGENT: "AGENT",
  HOUSEKEEPING: "HOUSEKEEPING",
  GUEST: "GUEST",
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
  { key: "payments.view", label: "View payments & dues", group: "Money" },
  { key: "payments.create", label: "Record payments", group: "Money" },
  { key: "expenses.view", label: "View expenses", group: "Money" },
  { key: "expenses.create", label: "Record expenses", group: "Money" },
  { key: "wallet.view", label: "View agent wallets", group: "Money" },
  { key: "wallet.manage", label: "Top-up / payout wallets", group: "Money" },
  { key: "rooms.view", label: "View rooms & rates", group: "Inventory" },
  { key: "rooms.manage", label: "Manage rooms, types & rates", group: "Inventory" },
  { key: "guests.view", label: "View guests", group: "Inventory" },
  { key: "restaurant.view", label: "View restaurant bills", group: "Restaurant" },
  { key: "restaurant.create", label: "Create restaurant bills (POS)", group: "Restaurant" },
  { key: "restaurant.menu", label: "Manage food packages", group: "Restaurant" },
  { key: "agents.view", label: "View agents", group: "Agents" },
  { key: "agents.manage", label: "Activate agents, invite, commission", group: "Agents" },
  { key: "reports.view", label: "View reports", group: "Reports" },
  { key: "reports.pl", label: "View profit & loss", group: "Reports" },
  { key: "payroll.view", label: "View payroll", group: "Payroll" },
  { key: "payroll.manage", label: "Manage staff & salary payments", group: "Payroll" },
  { key: "activities.view", label: "View activities", group: "Activities" },
  { key: "activities.delete", label: "Delete activities", group: "Activities" },
  { key: "discounts.manage", label: "Manage discount offers", group: "Admin" },
  { key: "users.manage", label: "Manage users", group: "Admin" },
  { key: "roles.manage", label: "Manage roles & permissions", group: "Admin" },
  { key: "settings.manage", label: "Resort settings", group: "Admin" },
  { key: "apikeys.manage", label: "API keys", group: "Admin" },
  // agent portal
  { key: "agent.book", label: "Book for guests", group: "Agent portal" },
  { key: "agent.wallet.view", label: "See wallet balance", group: "Agent portal" },
];

export const ALL_PERMISSIONS = PERMISSIONS.map((p) => p.key);

const PERMISSION_SET = new Set(ALL_PERMISSIONS);

export function isPermissionKey(key: string): boolean {
  return PERMISSION_SET.has(key);
}

export const PERMISSION_GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))];

/** Defaults for the seeded system roles, keyed by role name */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  Administrator: ALL_PERMISSIONS,
  Manager: [
    "bookings.view", "bookings.create", "bookings.edit", "bookings.cancel", "bookings.walkin",
    "payments.view", "payments.create", "expenses.view", "expenses.create", "wallet.view",
    "rooms.view", "rooms.manage", "guests.view",
    "restaurant.view", "restaurant.create", "restaurant.menu",
    "agents.view", "reports.view", "reports.pl",
    "payroll.view", "payroll.manage",
    "activities.view", "activities.delete", "discounts.manage",
  ],
  "Front Desk": [
    "bookings.view", "bookings.create", "bookings.edit", "bookings.walkin",
    "payments.view", "payments.create", "rooms.view", "guests.view",
    "restaurant.view", "restaurant.create", "activities.view",
  ],
  Agent: ["agent.book", "agent.wallet.view"],
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
