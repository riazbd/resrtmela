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
