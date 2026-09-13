import type { Prisma, PlatformPlan, Offer } from "@rh/db";
import { sameEmail } from "./contact";
import { round2 } from "./dates";
import { openingPosition, type ResolvedSchedule } from "./plan-schedules";

/** What the platform (or a resort's invitation) says an offer is. */
export type OfferInput = {
  audience: string;
  plan: string;
  trialDays?: number;
  discountPct?: number;
  maxUses?: number;
  expiresAt?: Date | string;
  email?: string;
  note?: string;
};

const refuse = (message: string) => Object.assign(new Error(message), { status: 400 });

/**
 * Spend one use of an offer, inside the signup's transaction.
 *
 * Every refusal throws, so the transaction rolls back and the signup leaves
 * nothing behind. The use is claimed with a conditional update rather than
 * read-then-write: two signups racing for the last use of an invitation must
 * not both get it.
 *
 * The offer's plan need not be on sale — landing someone on a plan the public
 * cannot pick is one of the things an offer is for.
 */
export async function redeemOffer(
  tx: Prisma.TransactionClient,
  code: string,
  who: { audience: "RESORT" | "AGENCY"; email: string },
): Promise<{ offer: Offer; plan: PlatformPlan }> {
  const offer = await tx.offer.findUnique({ where: { code: code.trim() } });
  if (!offer) throw refuse("This offer code does not exist");
  if (offer.audience !== who.audience) {
    throw refuse(offer.audience === "AGENCY" ? "This offer is for travel agencies — sign up as an agency" : "This offer is for resorts, not agencies");
  }
  if (offer.expiresAt && offer.expiresAt.getTime() <= Date.now()) throw refuse("This offer has expired");
  if (offer.email && !sameEmail(offer.email, who.email)) throw refuse("This invitation was sent to a different email address");

  const claimed = await tx.offer.updateMany({
    where: { id: offer.id, uses: { lt: offer.maxUses } },
    data: { uses: { increment: 1 } },
  });
  if (claimed.count !== 1) throw refuse("This offer has been used up");

  const plan = await tx.platformPlan.findUnique({ where: { name: offer.plan } });
  if (!plan || plan.audience !== offer.audience) throw refuse("This offer's plan is no longer available");
  return { offer, plan };
}

/**
 * The first subscription of an account: the plan's terms, or the offer's where
 * it has its own.
 *
 * The schedule is the customer's choice at signup, and it decides everything
 * about the money: how long a period is, what the first one costs, and what
 * the ones after it cost. An offer's discount is stored rather than baked into
 * the opening fee, because the fee is re-read from the ladder every period and
 * a discount that vanished at the first renewal would be a worse promise than
 * no discount.
 *
 * `renewsAt` and the phase anchor are the same instant — the day the paying
 * relationship starts, which is the end of the trial where there is one. Every
 * period this account is ever billed for is measured from it.
 */
export function openingSubscription(
  accountId: number,
  plan: PlatformPlan,
  schedule: ResolvedSchedule,
  offer?: Offer | null,
  now = new Date(),
) {
  const trialDays = offer?.trialDays ?? plan.trialDays;
  const onTrial = trialDays > 0;
  const trialEndsAt = onTrial ? new Date(now.getTime() + trialDays * 86_400_000) : null;
  const startsPaying = trialEndsAt ?? now;
  const discountPct = offer?.discountPct ?? null;
  const fee = discountPct
    ? round2((schedule.openingFee * (100 - discountPct)) / 100)
    : schedule.openingFee;
  return {
    accountId,
    plan: plan.name,
    status: onTrial ? "TRIAL" : "ACTIVE",
    fee,
    discountPct,
    trialEndsAt,
    renewsAt: startsPaying,
    ...openingPosition(schedule, startsPaying),
  };
}
