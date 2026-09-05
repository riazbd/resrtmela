/** Pure helpers for the signup wizard + plan limits — unit tested. */

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

/** null = ok, otherwise the human error for exceeding the plan cap. */
export function checkRoomCap(plan: string, currentRooms: number, adding = 1): string | null {
  const p = isPlanName(plan) ? PLANS[plan] : PLANS.FREE;
  if (currentRooms + adding > p.maxRoomsPerResort) {
    return `Plan ${p.label} allows up to ${p.maxRoomsPerResort} rooms per resort (you have ${currentRooms}). Upgrade the plan to add more.`;
  }
  return null;
}
