/**
 * Signup-wizard helpers and the legacy plan table.
 *
 * These limits now apply only to tenants with no subscription; PlanLimitsService
 * is the single place that decides which numbers a tenant actually gets.
 */

export function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const PLANS = {
  FREE: { label: "Free", maxRoomsPerResort: 10, maxResorts: 1 },
  STANDARD: { label: "Standard", maxRoomsPerResort: 50, maxResorts: 3 },
  PRO: { label: "Pro", maxRoomsPerResort: 500, maxResorts: 10 },
} as const;

export type PlanName = keyof typeof PLANS;

export function isPlanName(v: string): v is PlanName {
  return v === "FREE" || v === "STANDARD" || v === "PRO";
}
