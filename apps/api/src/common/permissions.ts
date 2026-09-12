import { Inject, Injectable } from "@nestjs/common";
import { AGENT_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, RESORT_PERMISSIONS, ROLE, type JwtClaims } from "@rh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { agentPermissionsFor } from "./agency-permissions";
import { forbid } from "./rbac";

/**
 * The system role that means "everything", by name.
 *
 * Its stored permission list is a snapshot taken the day the resort was
 * created, and `ensureResortRoles` never runs again for that resort — so every
 * key added afterwards is missing from it for ever, invisibly. Administrator
 * is a definition, not a list, so it is computed rather than read.
 */
export const ADMIN_ROLE = "Administrator";

/**
 * Seeds the three system roles for a resort (idempotent).
 *
 * Takes anything with `customRole`, so a caller inside a transaction can pass
 * the transaction. Signup could not: it called this with the outer client
 * while its own transaction still held the new resort uncommitted, so the role
 * insert waited on that row, the transaction timed out, and every signup
 * failed on a foreign key.
 */
export async function ensureResortRoles(prisma: Pick<PrismaService, "customRole">, resortId: number) {
  const count = await prisma.customRole.count({ where: { resortId } });
  if (count > 0) return;
  await prisma.customRole.createMany({
    data: (["Administrator", "Manager", "Front Desk"] as const).map((name) => ({
      resortId,
      name,
      permissions: DEFAULT_ROLE_PERMISSIONS[name] ?? [],
      system: true,
    })),
  });
}

@Injectable()
export class PermissionsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Resolves the permission keys for a user in a resort.
   * SUPER_ADMIN / RESORT_ADMIN → ["*"]. Custom role → role.permissions.
   * Legacy fixed roles → sensible defaults.
   */
  async resolve(claims: JwtClaims, resortId?: number): Promise<string[]> {
    if (claims.role === ROLE.SUPER_ADMIN || claims.role === ROLE.RESORT_ADMIN) return ["*"];

    /**
     * Agents are scoped to their agency, not to a resort.
     *
     * An agency's staff work across every resort the agency has been approved
     * for, so a resort-scoped role cannot describe them. An agency owner holds
     * every agent permission by being the owner; staff hold what their role
     * says, or the default set when they have none — which is what every agent
     * that existed before roles has.
     */
    if (claims.role === ROLE.AGENT) {
      const me = await this.prisma.user.findUnique({
        where: { id: claims.userId },
        select: { parentAgentId: true, agentRole: { select: { permissions: true } } },
      });
      if (!me) return [];
      // the same rule the agency-side services run through, so the menu this
      // draws and what those services allow cannot disagree
      return agentPermissionsFor(me);
    }

    const rid = resortId ?? claims.resortIds[0];
    if (rid == null) return [];
    const linked = await this.prisma.userResort.findUnique({
      where: { userId_resortId: { userId: claims.userId, resortId: rid } },
      include: { role: true },
    });
    if (linked?.role) {
      // `system` as well as the name: a role somebody called "Administrator"
      // themselves is an ordinary role and holds exactly what it says
      if (linked.role.system && linked.role.name === ADMIN_ROLE) return ["*"];
      const perms = linked.role.permissions;
      return Array.isArray(perms) ? (perms as string[]) : [];
    }
    if (claims.role === ROLE.MANAGER) return DEFAULT_ROLE_PERMISSIONS.Manager ?? [];
    if (claims.role === ROLE.FRONT_DESK) return DEFAULT_ROLE_PERMISSIONS["Front Desk"] ?? [];
    if (claims.role === ROLE.HOUSEKEEPING) return [];
    return [];
  }

  /** True when the user holds the permission (or ["*"]). */
  async can(claims: JwtClaims, resortId: number | undefined, perm: string): Promise<boolean> {
    const perms = await this.resolve(claims, resortId);
    return perms.includes("*") || perms.includes(perm);
  }

  /** Throws 403 when missing. */
  async require(claims: JwtClaims, resortId: number | undefined, perm: string): Promise<void> {
    if (!(await this.can(claims, resortId, perm))) {
      throw forbid(`Missing permission: ${perm}`);
    }
  }
}

/**
 * The keys that may be stored on a role, filtered to the audience that owns it.
 *
 * The audience matters as much as the key does. A resort role holding
 * `agent.wallet.view` grants nothing — agency endpoints read the *agency*
 * role — but it is a key the resort's owner was invited to tick, and a switch
 * wired to nothing is worse than no switch. An agency role holding
 * `payroll.manage` would be the reverse and worse: the escalation the
 * `AGENT_PERMISSIONS` comment in @rh/shared warns about.
 *
 * Filtered here and not only in the form, because a checkbox removed from a
 * page is still reachable by anyone willing to post the body themselves.
 *
 * The agency side has its own stricter path — `AgentService.checkPermissions`
 * refuses an unknown key with a sentence rather than dropping it — so nothing
 * passes "AGENCY" today. The parameter exists because without it, anyone who
 * reaches for this function on an agency role gets every key silently deleted,
 * which is a worse bug than the one being fixed here.
 */
export function validPermissions(keys: unknown, audience: "RESORT" | "AGENCY" = "RESORT"): string[] {
  if (!Array.isArray(keys)) return [];
  const shelf: readonly string[] = audience === "AGENCY" ? AGENT_PERMISSIONS : RESORT_PERMISSIONS;
  return keys.filter((k): k is string => typeof k === "string" && shelf.includes(k));
}
