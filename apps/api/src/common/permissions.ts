import { Inject, Injectable } from "@nestjs/common";
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, ROLE, type JwtClaims } from "@rh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { agentPermissionsFor } from "./agency-permissions";
import { forbid } from "./rbac";

/** Seeds the three system roles for a resort (idempotent). */
export async function ensureResortRoles(prisma: PrismaService, resortId: number) {
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

export function validPermissions(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  return keys.filter((k): k is string => typeof k === "string" && ALL_PERMISSIONS.includes(k));
}
