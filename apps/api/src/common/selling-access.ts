/**
 * Who may sell a resort (2026-09-11 design, §8).
 *
 *   selling access = agency verified and paid up
 *                  AND resort open to agents
 *                  AND this agency not blocked by this resort
 *
 * Computed here, on every request. It used to be a `user_resorts` row, turned
 * into the login token's `resortIds` — so closing the door on an agency did
 * nothing until its token expired a week later, and every agency sat in the
 * resort's team list because that table was the only place access could live.
 */
import type { PrismaService } from "../prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";
import { canAccessResort, forbid } from "./rbac";

type Db = Pick<PrismaService, "user" | "resort">;

export interface Agency {
  /** the agency's account; null only for an agent older than accounts */
  accountId: number | null;
  /** why it may not sell anywhere, in a sentence — null when it may */
  refusal: string | null;
}

/** The agency this agent sells for, and whether it may sell at all. Staff sell for the agency that hired them. */
export async function agencyOf(prisma: Db, userId: number): Promise<Agency> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      status: true,
      accountId: true,
      account: { select: { status: true, suspendedReason: true } },
      parentAgent: { select: { accountId: true, account: { select: { status: true, suspendedReason: true } } } },
    },
  });
  if (!u || u.role !== "AGENT") return { accountId: null, refusal: "Agents only" };
  const accountId = u.accountId ?? u.parentAgent?.accountId ?? null;
  const account = u.account ?? u.parentAgent?.account ?? null;
  if (u.status !== "active") return { accountId, refusal: "Agent account is not activated yet" };
  // every agency was given an account when accounts arrived; one without is older than that
  if (!account || account.status === "active") return { accountId, refusal: null };
  if (account.status === "pending") {
    return {
      accountId,
      refusal: "This agency has not been verified yet. The platform verifies each agency once — until then it can look around, but not sell.",
    };
  }
  return {
    accountId,
    // the bookings it already made are read through its own records, not this
    refusal:
      account.suspendedReason === "billing"
        ? "This agency's account is suspended for an unpaid bill, so it cannot make new bookings. Bookings it has already made are unaffected."
        : "This agency's account is suspended, so it cannot make new bookings. Bookings it has already made are unaffected.",
  };
}

/** The resorts open to this agency right now — `only` narrows to one. Oldest first. */
export async function sellableFor(prisma: Db, accountId: number | null, only?: number): Promise<number[]> {
  const rows = await prisma.resort.findMany({
    where: {
      status: "active",
      agentsOpen: true,
      ...(only != null ? { id: only } : {}),
      ...(accountId != null ? { agencyTerms: { none: { accountId, blocked: true } } } : {}),
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return rows.map((r) => r.id);
}

/** The resorts this agent may sell right now, by the one rule. */
export async function sellableResortIds(prisma: Db, userId: number, only?: number): Promise<number[]> {
  const agency = await agencyOf(prisma, userId);
  return agency.refusal ? [] : sellableFor(prisma, agency.accountId, only);
}

/**
 * The caller may sell this resort: an agency the rule lets in, or the resort's
 * own staff.
 *
 * Use this only where an agency genuinely needs the data to do its job —
 * searching for a free room, making a booking, the shop window. Anything that
 * returns another party's bookings, money or guests belongs to
 * `requireResortAccess`; anything returning the agency's *own* bookings narrows
 * the query to the agency and needs no selling access at all, so what it
 * already sold stays readable after a door closes.
 */
export async function requireSellingAccess(prisma: Db, claims: JwtClaims, resortId: number): Promise<void> {
  if (claims.role !== ROLE.AGENT) {
    if (!canAccessResort(claims, resortId)) throw forbid("No access to this resort");
    return;
  }
  const agency = await agencyOf(prisma, claims.userId);
  if (agency.refusal) throw forbid(agency.refusal);
  const [open] = await sellableFor(prisma, agency.accountId, resortId);
  if (open == null) throw forbid("This resort is not open to your agency");
}
