/**
 * What a guest can be charged for beyond the room.
 *
 * Three things, and the owner asks a different question of each: a *service*
 * is something the resort sold (water, laundry, a transfer); *damage* is what
 * it costs to put an asset right; a *fine* is a rule broken. Kept apart so the
 * month can say how much of the takings were fines, and an invoice can say
 * what a line was for.
 */
export const STAY_CHARGE_KINDS = ["SERVICE", "DAMAGE", "FINE"] as const;

export type StayChargeKind = (typeof STAY_CHARGE_KINDS)[number];

export function isStayChargeKind(value: unknown): value is StayChargeKind {
  return typeof value === "string" && (STAY_CHARGE_KINDS as readonly string[]).includes(value);
}

export const STAY_CHARGE_LABELS: Record<StayChargeKind, string> = {
  SERVICE: "Service",
  DAMAGE: "Damage",
  FINE: "Fine",
};
