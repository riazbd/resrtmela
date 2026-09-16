/**
 * The keys an agency's own website holds (2026-09-17 design, §3).
 *
 * The resort's key rules, unchanged: shown once, stored as a hash, scoped to
 * what the integration needs, revocable the same second. Minting one needs the
 * agency's plan to include the API; managing them needs the agency permission,
 * which the owner holds and a member of staff only when given it.
 */
import { Inject, Injectable } from "@nestjs/common";
import { ROLE, type JwtClaims } from "@rh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../common/permissions";
import { PlanLimitsService } from "../common/plan-limits.service";
import { AuditService } from "../common/audit.service";
import { agencyOf } from "../common/selling-access";
import { badRequest, forbid } from "../common/rbac";
import { ApiKeyService, askedScopes, scopesOf } from "./api-key.service";

@Injectable()
export class AgencyKeysService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
    @Inject(PlanLimitsService) private readonly planLimits: PlanLimitsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** The agency this person may manage keys for. */
  private async account(claims: JwtClaims): Promise<number> {
    if (claims.role !== ROLE.AGENT) throw forbid("Agencies only");
    await this.perms.require(claims, undefined, "agent.apikeys.manage");
    const { accountId } = await agencyOf(this.prisma, claims.userId);
    if (accountId == null) throw forbid("This agent has no agency account.");
    return accountId;
  }

  async list(claims: JwtClaims) {
    const accountId = await this.account(claims);
    const rows = await this.prisma.apiKey.findMany({
      where: { accountId },
      select: { id: true, name: true, prefix: true, scopes: true, active: true, lastUsedAt: true, createdAt: true },
      orderBy: { id: "desc" },
    });
    return rows.map((r) => ({ ...r, id: String(r.id), scopes: scopesOf(r.scopes) }));
  }

  async create(claims: JwtClaims, name: string, scopes?: unknown) {
    const accountId = await this.account(claims);
    await this.planLimits.requireAccountFeature(accountId, "agency_api");

    const label = String(name ?? "").trim();
    if (!label) throw badRequest("Give the key a name, so you know what to revoke later.");
    const held = askedScopes(scopes);

    const { secret, prefix, keyHash } = ApiKeyService.mint();
    const row = await this.prisma.apiKey.create({
      data: { accountId, name: label.slice(0, 120), prefix, keyHash, scopes: held as never },
    });
    await this.audit.log({
      actorId: claims.userId,
      action: "agency.apikey.create",
      entity: "api_key",
      entityId: Number(row.id),
      // never the secret, which this is the last moment anybody could write down
      diff: { accountId, name: label, scopes: held },
    });
    return { id: String(row.id), prefix, scopes: held, secret };
  }

  async revoke(claims: JwtClaims, id: number) {
    const accountId = await this.account(claims);
    const row = await this.prisma.apiKey.findUnique({ where: { id: BigInt(id) } });
    if (!row || row.accountId !== accountId) throw Object.assign(new Error("No such key"), { status: 404 });
    await this.prisma.apiKey.update({ where: { id: row.id }, data: { active: false } });
    await this.audit.log({
      actorId: claims.userId,
      action: "agency.apikey.revoke",
      entity: "api_key",
      entityId: id,
      diff: { accountId },
    });
    return { ok: true };
  }
}
