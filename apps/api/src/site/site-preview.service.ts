/**
 * A page, shown to its owner before anybody else (2026-09-17).
 *
 * The public doors (`/site/...`) serve only what is published and on a plan
 * with a website, and answer 404 for everything else — correctly, and to the
 * owner as well. The editor promised the owner a look before publishing, so
 * this is that look: signed in, the page's owner only, and nothing else gated,
 * because weighing up the plan is exactly when an owner wants to see the page.
 */
import { Inject, Injectable } from "@nestjs/common";
import { ROLE, type AgencyPublished, type JwtClaims, type PublishedResort } from "@rh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../common/permissions";
import { agencyOf } from "../common/selling-access";
import { forbid, requireResortAccess } from "../common/rbac";
import { PublishedSiteService } from "./published-site.service";
import { AgencyPublishedService } from "./agency-published.service";
import { idList } from "./agency-site-editor.service";

@Injectable()
export class SitePreviewService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
    @Inject(PublishedSiteService) private readonly published: PublishedSiteService,
    @Inject(AgencyPublishedService) private readonly agencyPublished: AgencyPublishedService,
  ) {}

  /** The resort's page as it will look — the same drawing the public page uses. */
  async resort(claims: JwtClaims, resortId: number): Promise<PublishedResort> {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "settings.manage");
    return this.published.forApi(resortId);
  }

  /** The agency's page as it will look, with the resorts it hid left out. */
  async agency(claims: JwtClaims): Promise<AgencyPublished> {
    if (claims.role !== ROLE.AGENT) throw forbid("Agencies only");
    await this.perms.require(claims, undefined, "agent.website.manage");
    const { accountId } = await agencyOf(this.prisma, claims.userId);
    if (accountId == null) throw forbid("This agent has no agency account.");
    const site = await this.prisma.agencySite.findUnique({ where: { accountId }, select: { hiddenResortIds: true } });
    return this.agencyPublished.draw(accountId, idList(site?.hiddenResortIds));
  }
}
