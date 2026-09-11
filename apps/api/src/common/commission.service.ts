/**
 * What the resort pays its agents.
 *
 * Commission was a per-agent term — `UserResort.commissionRate` and
 * `commissionKind`, typed in when an agent was created and edited per person
 * afterwards. Two agents selling the same room could earn different money on
 * it, and no screen in the console listed the rates side by side, so "what do
 * we pay agents" was a query rather than an answer.
 *
 * The rate belongs to the resort now: one number, set by hand by whoever holds
 * `agents.manage`. Six call sites used to read the agent's own row — the
 * booking screen, room availability, the owner's agent report, the agent's own
 * report, the agency search and login — and each one was a chance for the
 * three copies of the arithmetic to drift, which is exactly how an agent on
 * flat terms once saw ৳75,000 where the owner's report said ৳1,000.
 *
 * The arithmetic itself stays in `common/money.ts`. This decides only *which*
 * terms apply, and it is the only thing that does.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { JwtClaims } from "@rh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "./permissions";
import { AuditService } from "./audit.service";
import { badRequest, requireResortAccess } from "./rbac";
import { agentCommission, type AgentTerms, type CommissionKind } from "./money";

export interface CommissionTerms {
  kind: CommissionKind;
  /** A percentage of rent when PERCENT, a fixed amount per booking when FLAT. */
  rate: number;
}

/** The shape the money functions take, from a resort row already in hand. */
export function termsOf(resort: {
  agentCommissionKind: string;
  agentCommissionRate: unknown;
}): AgentTerms {
  return {
    commissionKind: resort.agentCommissionKind === "FLAT" ? "FLAT" : "PERCENT",
    commissionRate: Number(resort.agentCommissionRate ?? 0),
  };
}

/** What a resort selects when it needs the terms alongside whatever else it wants. */
export const COMMISSION_SELECT = {
  agentCommissionKind: true,
  agentCommissionRate: true,
} as const;

@Injectable()
export class CommissionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * The terms an agency sells this resort on: the rate the resort struck with
   * that agency where it struck one (2026-09-11 design, §8.2), else the
   * resort's own. Falls back to the schema default for a resort that is gone.
   */
  async termsFor(resortId: number, accountId?: number | null): Promise<CommissionTerms> {
    if (accountId != null) {
      const deal = await this.prisma.resortAgency.findUnique({
        where: { resortId_accountId: { resortId, accountId } },
        select: { commissionKind: true, commissionRate: true },
      });
      if (deal?.commissionRate != null) {
        return { kind: deal.commissionKind === "FLAT" ? "FLAT" : "PERCENT", rate: Number(deal.commissionRate) };
      }
    }
    const resort = await this.prisma.resort.findUnique({
      where: { id: resortId },
      select: COMMISSION_SELECT,
    });
    if (!resort) return { kind: "PERCENT", rate: 0 };
    return {
      kind: resort.agentCommissionKind === "FLAT" ? "FLAT" : "PERCENT",
      rate: Number(resort.agentCommissionRate ?? 0),
    };
  }

  /**
   * The terms, for anyone with access to the resort.
   *
   * Deliberately not behind `agents.manage`: an agent has to be able to read
   * what they are paid, and the front desk has to be able to answer when asked.
   * Changing it is the gated action.
   */
  async publicTermsFor(claims: JwtClaims, resortId: number): Promise<CommissionTerms> {
    requireResortAccess(claims, resortId);
    return this.termsFor(resortId);
  }

  /** What an agent earns on some rent at this resort. One arithmetic, in `money.ts`. */
  async on(resortId: number, rent: number, bookings = 1): Promise<number> {
    const terms = await this.termsFor(resortId);
    return agentCommission({ commissionKind: terms.kind, commissionRate: terms.rate }, rent, bookings);
  }

  async setTerms(
    claims: JwtClaims,
    resortId: number,
    input: { kind: string; rate: number },
  ): Promise<CommissionTerms> {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "agents.manage");

    const kind: CommissionKind = input.kind === "FLAT" ? "FLAT" : "PERCENT";
    const rate = Number(input.rate);
    if (!Number.isFinite(rate) || rate < 0) throw badRequest("Commission cannot be negative.");
    if (kind === "PERCENT" && rate > 100) {
      throw badRequest("A percentage commission cannot be more than 100% of the rent.");
    }
    // a flat fee is capped at the rent it comes out of by `agentCommission`,
    // but a fee in the millions is a typo, not a policy
    if (kind === "FLAT" && rate > 1_000_000) throw badRequest("That flat fee looks like a typo.");

    const before = await this.termsFor(resortId);
    await this.prisma.resort.update({
      where: { id: resortId },
      data: { agentCommissionKind: kind, agentCommissionRate: rate as never },
    });
    await this.audit.log({
      actorId: claims.userId,
      resortId,
      action: "resort.commission.set",
      entity: "resort",
      entityId: resortId,
      diff: { from: before, to: { kind, rate } },
    });
    return { kind, rate };
  }
}
