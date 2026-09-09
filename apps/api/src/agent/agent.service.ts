/**
 * The agency's own side of the platform.
 *
 * An agent here is a travel agent: a third party who sells a resort's rooms,
 * earns commission, holds a wallet, and is not staff of the resort. An agency
 * has people working under it — and until now the platform had no idea which
 * people, gave all of them the same powers, showed them no activity log, and
 * held their money without showing them a balance.
 *
 * Three rules run through this file:
 *
 * 1. **An agency is the unit, not a person.** The wallet, the roles and the
 *    activity log belong to the agency; staff act inside it. A staff member
 *    does not get a wallet of their own — they spend the agency's.
 * 2. **An agency owner holds everything by being the owner.** Only staff carry
 *    a role, because only staff can be given less.
 * 3. **Nothing here reaches the resort.** An agency is a customer of the
 *    platform, not an administrator of it, so an agency role can never grant a
 *    resort-side permission.
 */
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { forbid, badRequest } from "../common/rbac";
import { AGENT_PERMISSIONS, isAgentPermission, ROLE, type JwtClaims } from "@rh/shared";

export interface AgentRoleView {
  id: number;
  name: string;
  permissions: string[];
  staff: number;
}

@Injectable()
export class AgentService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * The agency this caller belongs to, and what they may do inside it.
   *
   * An agency owner (no parent) holds every agent permission. A staff member
   * holds what their role says, or the default set when they have no role —
   * which is what every existing staff member has today.
   */
  private async context(claims: JwtClaims) {
    if (claims.role !== ROLE.AGENT) throw forbid("Agents only");
    const me = await this.prisma.user.findUnique({
      where: { id: claims.userId },
      select: { id: true, parentAgentId: true, agentRole: { select: { permissions: true } } },
    });
    if (!me) throw forbid("Agents only");
    const agencyId = me.parentAgentId ?? me.id;
    const isOwner = me.parentAgentId == null;
    const permissions = isOwner
      ? [...AGENT_PERMISSIONS]
      : Array.isArray(me.agentRole?.permissions)
        ? (me.agentRole!.permissions as string[])
        : ["agent.book", "agent.wallet.view"];
    return { agencyId, isOwner, permissions };
  }

  private require(ctx: { permissions: string[] }, perm: string) {
    if (!ctx.permissions.includes(perm)) throw forbid(`Missing permission: ${perm}`);
  }

  /** Everyone acting under this agency: the owner and their staff. */
  private async agencyActorIds(agencyId: number): Promise<number[]> {
    const staff = await this.prisma.user.findMany({
      where: { parentAgentId: agencyId },
      select: { id: true },
    });
    return [agencyId, ...staff.map((s) => s.id)];
  }

  // ─────────────────────────── roles ───────────────────────────

  async listRoles(claims: JwtClaims): Promise<AgentRoleView[]> {
    const ctx = await this.context(claims);
    this.require(ctx, "agent.staff.manage");
    const rows = await this.prisma.agentRole.findMany({
      where: { agencyId: ctx.agencyId },
      include: { _count: { select: { staff: true } } },
      orderBy: { id: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      permissions: Array.isArray(r.permissions) ? (r.permissions as string[]) : [],
      staff: r._count.staff,
    }));
  }

  async createRole(claims: JwtClaims, input: { name: string; permissions: string[] }) {
    const ctx = await this.context(claims);
    this.require(ctx, "agent.staff.manage");
    const permissions = this.checkPermissions(input.permissions);
    const name = input.name?.trim();
    if (!name) throw badRequest("The role needs a name");
    const role = await this.prisma.agentRole.create({
      data: { agencyId: ctx.agencyId, name, permissions },
    });
    return { id: role.id, name: role.name, permissions };
  }

  async updateRole(claims: JwtClaims, roleId: number, input: { name?: string; permissions?: string[] }) {
    const ctx = await this.context(claims);
    this.require(ctx, "agent.staff.manage");
    await this.ownRole(ctx.agencyId, roleId);
    const role = await this.prisma.agentRole.update({
      where: { id: roleId },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.permissions ? { permissions: this.checkPermissions(input.permissions) } : {}),
      },
    });
    return { id: role.id, name: role.name, permissions: role.permissions as string[] };
  }

  async deleteRole(claims: JwtClaims, roleId: number) {
    const ctx = await this.context(claims);
    this.require(ctx, "agent.staff.manage");
    await this.ownRole(ctx.agencyId, roleId);
    // staff keep working on the default set rather than losing access mid-day
    await this.prisma.user.updateMany({ where: { agentRoleId: roleId }, data: { agentRoleId: null } });
    await this.prisma.agentRole.delete({ where: { id: roleId } });
    return { deleted: true };
  }

  /** Puts a staff member on a role. Both must belong to this agency. */
  async assignRole(claims: JwtClaims, staffUserId: number, roleId: number | null) {
    const ctx = await this.context(claims);
    this.require(ctx, "agent.staff.manage");
    const staff = await this.prisma.user.findUnique({
      where: { id: staffUserId },
      select: { parentAgentId: true },
    });
    if (!staff || staff.parentAgentId !== ctx.agencyId) throw forbid("Not your staff");
    if (roleId != null) await this.ownRole(ctx.agencyId, roleId);
    await this.prisma.user.update({ where: { id: staffUserId }, data: { agentRoleId: roleId } });
    return { assigned: true };
  }

  private async ownRole(agencyId: number, roleId: number) {
    const role = await this.prisma.agentRole.findUnique({ where: { id: roleId }, select: { agencyId: true } });
    if (!role || role.agencyId !== agencyId) throw forbid("Not your role");
  }

  /**
   * An unknown key is a mistake worth refusing rather than dropping quietly —
   * a role that silently loses a permission is a support call nobody can
   * explain. A resort-side key is refused for a stronger reason: it would be
   * an agency granting itself power over its supplier.
   */
  private checkPermissions(keys: unknown): string[] {
    if (!Array.isArray(keys)) throw badRequest("permissions must be a list");
    const bad = keys.filter((k) => typeof k !== "string" || !isAgentPermission(k));
    if (bad.length > 0) {
      throw badRequest(
        `Not an agency permission: ${bad.join(", ")}. Available: ${AGENT_PERMISSIONS.join(", ")}`,
      );
    }
    return [...new Set(keys as string[])];
  }

  // ─────────────────────────── the money ───────────────────────────

  /**
   * The agency's wallet.
   *
   * `agent.wallet.view` has existed in the permission list since the matrix was
   * built, was granted to every agent, and nothing ever read it. Money moved
   * through the wallet and the agent it belonged to had no way to see a
   * balance — the platform held their money and showed them no statement.
   */
  async wallet(claims: JwtClaims) {
    const ctx = await this.context(claims);
    this.require(ctx, "agent.wallet.view");
    const wallet = await this.prisma.wallet.upsert({
      where: { userId: ctx.agencyId },
      update: {},
      create: { userId: ctx.agencyId },
    });
    const txns = await this.prisma.walletTxn.findMany({
      where: { walletId: wallet.id },
      orderBy: { id: "desc" },
      take: 100,
    });
    return {
      balance: Number(wallet.balance),
      active: wallet.active,
      txns: txns.map((t) => ({
        id: t.id.toString(),
        kind: t.kind,
        amount: Number(t.amount),
        balanceAfter: Number(t.balanceAfter),
        note: t.note,
        bookingId: t.bookingId,
        createdAt: t.createdAt,
      })),
    };
  }

  // ─────────────────────────── who did what ───────────────────────────

  /**
   * What this agency and its staff did.
   *
   * The resort side has had a searchable log since the permission matrix
   * landed; the agency side had nothing, so an agency could not answer "who
   * cancelled that booking" about its own people.
   */
  async activity(claims: JwtClaims, query: { q?: string; take?: number }) {
    const ctx = await this.context(claims);
    this.require(ctx, "agent.auditlog.view");
    const actorIds = await this.agencyActorIds(ctx.agencyId);
    const search = query.q?.trim();
    const rows = await this.prisma.auditLog.findMany({
      where: {
        actorId: { in: actorIds },
        ...(search
          ? {
              OR: [
                { action: { contains: search } },
                { entity: { contains: search } },
                { actor: { name: { contains: search } } },
              ],
            }
          : {}),
      },
      include: {
        actor: { select: { id: true, name: true } },
        resort: { select: { id: true, name: true } },
      },
      orderBy: { id: "desc" },
      take: Math.min(query.take ?? 100, 300),
    });
    return rows.map((r) => ({
      id: r.id.toString(),
      actor: r.actor,
      resort: r.resort,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      at: r.createdAt,
    }));
  }

  /** What the caller may do, for the console to draw the right menu. */
  async me(claims: JwtClaims) {
    const ctx = await this.context(claims);
    return { agencyId: ctx.agencyId, isOwner: ctx.isOwner, permissions: ctx.permissions };
  }
}
