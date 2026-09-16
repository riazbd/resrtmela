/**
 * Where an agency's own website is told about its bookings (2026-09-17).
 *
 * The resort's endpoint rules: https only, a signing secret shown once, a
 * delivery log with a retry button. Part of the API feature, so adding an
 * endpoint needs the agency's plan to include it.
 */
import { Inject, Injectable } from "@nestjs/common";
import { ROLE, type JwtClaims } from "@rh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../common/permissions";
import { PlanLimitsService } from "../common/plan-limits.service";
import { AuditService } from "../common/audit.service";
import { agencyOf } from "../common/selling-access";
import { badRequest, forbid } from "../common/rbac";
import { WebhookService } from "./webhook.service";

@Injectable()
export class AgencyWebhooksService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WebhookService) private readonly webhooks: WebhookService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
    @Inject(PlanLimitsService) private readonly planLimits: PlanLimitsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async account(claims: JwtClaims): Promise<number> {
    if (claims.role !== ROLE.AGENT) throw forbid("Agencies only");
    await this.perms.require(claims, undefined, "agent.apikeys.manage");
    const { accountId } = await agencyOf(this.prisma, claims.userId);
    if (accountId == null) throw forbid("This agent has no agency account.");
    return accountId;
  }

  async list(claims: JwtClaims) {
    const accountId = await this.account(claims);
    return this.prisma.webhookEndpoint.findMany({
      where: { accountId },
      select: { id: true, url: true, active: true, createdAt: true },
      orderBy: { id: "asc" },
    });
  }

  async add(claims: JwtClaims, rawUrl: string): Promise<{ id: number; url: string; secret: string }> {
    const accountId = await this.account(claims);
    await this.planLimits.requireAccountFeature(accountId, "agency_api");
    const url = String(rawUrl ?? "").trim();
    if (!/^https:\/\/[^\s]+$/i.test(url)) {
      throw badRequest("That must be an https:// address we can reach from the internet.");
    }
    const secret = WebhookService.newSecret();
    const row = await this.prisma.webhookEndpoint.create({ data: { accountId, url, secret } });
    await this.audit.log({ actorId: claims.userId, action: "agency.webhook.add", entity: "webhook_endpoint", entityId: row.id, diff: { accountId, url } });
    return { id: row.id, url: row.url, secret };
  }

  async remove(claims: JwtClaims, id: number): Promise<{ removed: true }> {
    const accountId = await this.account(claims);
    const row = await this.prisma.webhookEndpoint.findFirst({ where: { id, accountId } });
    if (!row) throw Object.assign(new Error("No such endpoint"), { status: 404 });
    await this.prisma.webhookEndpoint.delete({ where: { id: row.id } });
    await this.audit.log({ actorId: claims.userId, action: "agency.webhook.remove", entity: "webhook_endpoint", entityId: row.id, diff: { accountId } });
    return { removed: true };
  }

  async deliveries(claims: JwtClaims) {
    const accountId = await this.account(claims);
    const rows = await this.prisma.webhookDelivery.findMany({
      where: { endpoint: { accountId } },
      orderBy: { id: "desc" },
      take: 50,
      select: {
        id: true, event: true, attempts: true, lastStatus: true, lastError: true,
        deliveredAt: true, nextAttemptAt: true, createdAt: true, endpoint: { select: { url: true } },
      },
    });
    return rows.map((r) => ({
      ...r,
      id: String(r.id),
      state: r.deliveredAt ? "delivered" : r.nextAttemptAt ? "trying" : "gave up",
    }));
  }

  async retry(claims: JwtClaims, id: bigint) {
    return this.webhooks.retryFor({ accountId: await this.account(claims) }, id);
  }
}
