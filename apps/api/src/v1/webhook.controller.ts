import { Body, Controller, Delete, Get, Inject, Param, ParseIntPipe, Post, Req, UseGuards } from "@nestjs/common";
import { IsString, MaxLength } from "class-validator";
import { AuthGuard, type AuthedRequest } from "../common/auth.guard";
import { PermissionsService } from "../common/permissions";
import { AuditService } from "../common/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { badRequest, requireResortAccess } from "../common/rbac";
import { WebhookService } from "./webhook.service";

class EndpointDto {
  @IsString() @MaxLength(500) url!: string;
}

/**
 * Where a resort's own website is told things, and what happened to each call.
 *
 * The deliveries list is the point of the whole table: "did they get it" is a
 * question the resort will ask, and a log line is not an answer anybody can
 * read. Failures are visible here, and so is the button that tries again.
 */
@UseGuards(AuthGuard)
@Controller("resorts/:id/webhooks")
export class WebhookController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WebhookService) private readonly webhooks: WebhookService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async mine(req: AuthedRequest, resortId: number): Promise<void> {
    requireResortAccess(req.user, resortId);
    await this.perms.require(req.user, resortId, "apikeys.manage");
  }

  @Get()
  async list(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    await this.mine(req, id);
    const rows = await this.prisma.webhookEndpoint.findMany({
      where: { resortId: id },
      // never the secret: it was shown once, at creation, like a key
      select: { id: true, url: true, active: true, createdAt: true },
      orderBy: { id: "asc" },
    });
    return rows;
  }

  @Post()
  async add(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: EndpointDto) {
    await this.mine(req, id);
    const url = dto.url.trim();
    // https only: the signature proves who sent a call, and nothing else
    // protects what is in it on the way
    if (!/^https:\/\/[^\s]+$/i.test(url)) {
      throw badRequest("That must be an https:// address we can reach from the internet.");
    }
    const secret = WebhookService.newSecret();
    const row = await this.prisma.webhookEndpoint.create({ data: { resortId: id, url, secret } });
    await this.audit.log({
      actorId: req.user.userId,
      resortId: id,
      action: "webhook.add",
      entity: "webhook_endpoint",
      entityId: row.id,
      diff: { url },
    });
    // the one and only time the secret is readable
    return { id: row.id, url: row.url, secret };
  }

  @Delete(":endpointId")
  async remove(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Param("endpointId", ParseIntPipe) endpointId: number,
  ) {
    await this.mine(req, id);
    const row = await this.prisma.webhookEndpoint.findFirst({ where: { id: endpointId, resortId: id } });
    if (!row) throw Object.assign(new Error("No such endpoint"), { status: 404 });
    await this.prisma.webhookEndpoint.delete({ where: { id: row.id } });
    await this.audit.log({
      actorId: req.user.userId,
      resortId: id,
      action: "webhook.remove",
      entity: "webhook_endpoint",
      entityId: row.id,
    });
    return { removed: true };
  }

  /** What was sent, what came back, and whether anybody is still trying. */
  @Get("deliveries")
  async deliveries(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    await this.mine(req, id);
    const rows = await this.prisma.webhookDelivery.findMany({
      where: { endpoint: { resortId: id } },
      orderBy: { id: "desc" },
      take: 50,
      select: {
        id: true,
        event: true,
        attempts: true,
        lastStatus: true,
        lastError: true,
        deliveredAt: true,
        nextAttemptAt: true,
        createdAt: true,
        endpoint: { select: { url: true } },
      },
    });
    return rows.map((r) => ({
      ...r,
      id: String(r.id),
      // three states, said in one word rather than left to be worked out from
      // two nullable timestamps
      state: r.deliveredAt ? "delivered" : r.nextAttemptAt ? "trying" : "gave up",
    }));
  }

  @Post("deliveries/:deliveryId/retry")
  async retry(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Param("deliveryId") deliveryId: string,
  ) {
    await this.mine(req, id);
    return this.webhooks.retry(id, BigInt(deliveryId));
  }
}
