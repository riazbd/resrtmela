/**
 * Which agency is asking, and what they may do inside it.
 *
 * Every agency-side service needs the same three answers, and getting any of
 * them subtly different in one file is how a cross-agency leak happens — the
 * kind where two agencies selling the same resort can read each other's
 * people. So the answers are computed in exactly one place.
 *
 * The rules, unchanged from the day the agent portal landed:
 *
 * 1. **An agency is the unit, not a person.** The wallet, the books, the
 *    packages and the log belong to the agency; staff act inside it.
 * 2. **An owner holds everything by being the owner.** Only staff carry a
 *    role, because only staff can be given less.
 * 3. **Nothing here reaches the resort.** An agency is a customer of the
 *    platform, not an administrator of it.
 *
 * Rule 2 is spelled out in `common/agency-permissions.ts`, which the console's
 * permission service reads too — so the menu it draws and the answers given
 * here cannot disagree.
 */
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { forbid } from "../common/rbac";
import { agentPermissionsFor } from "../common/agency-permissions";
import { ROLE, type JwtClaims } from "@rh/shared";

export interface AgencyContext {
  agencyId: number;
  isOwner: boolean;
  permissions: string[];
}

@Injectable()
export class AgencyContextService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async of(claims: JwtClaims): Promise<AgencyContext> {
    if (claims.role !== ROLE.AGENT) throw forbid("Agents only");
    const me = await this.prisma.user.findUnique({
      where: { id: claims.userId },
      select: { id: true, parentAgentId: true, agentRole: { select: { permissions: true } } },
    });
    if (!me) throw forbid("Agents only");
    return {
      agencyId: me.parentAgentId ?? me.id,
      isOwner: me.parentAgentId == null,
      permissions: agentPermissionsFor(me),
    };
  }

  /** The context, refused unless it carries this permission. */
  async require(claims: JwtClaims, permission: string): Promise<AgencyContext> {
    const ctx = await this.of(claims);
    if (!ctx.permissions.includes(permission)) throw forbid(`Missing permission: ${permission}`);
    return ctx;
  }

  /** Everyone acting under this agency: the owner and their staff. */
  async actorIds(agencyId: number): Promise<number[]> {
    const staff = await this.prisma.user.findMany({
      where: { parentAgentId: agencyId },
      select: { id: true },
    });
    return [agencyId, ...staff.map((s) => s.id)];
  }
}
