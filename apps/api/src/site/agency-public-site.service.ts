/**
 * An agency's page, as a stranger sees it (2026-09-17 design, §1).
 *
 * `null` for every reason a page should not be served — no such agency, not
 * published, not active, a plan without a website. One answer for all of them,
 * as for a resort: which it is belongs to the agency, not to the internet.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { AgencyPublished, PublishedVacancy } from "@rh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PlanLimitsService } from "../common/plan-limits.service";
import { assertWithinAgentWindow } from "../common/agent-window";
import { AgencyPublishedService } from "./agency-published.service";
import { idList } from "./agency-site-editor.service";

@Injectable()
export class AgencyPublicSiteService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AgencyPublishedService) private readonly published: AgencyPublishedService,
    @Inject(PlanLimitsService) private readonly planLimits: PlanLimitsService,
  ) {}

  private async live(slug: string) {
    const account = await this.prisma.tenant.findUnique({
      where: { slug: String(slug ?? "") },
      include: { agencySite: true },
    });
    if (!account || account.kind !== "AGENCY" || account.status !== "active") return null;
    if (!account.agencySite?.published) return null;
    // asked, not enforced: a stranger is not told which plan an agency is on
    if (!(await this.planLimits.hasAccountFeature(account.id, "agency_website"))) return null;
    return account;
  }

  async page(slug: string): Promise<AgencyPublished | null> {
    const account = await this.live(slug);
    if (!account) return null;
    return this.published.draw(account.id, idList(account.agencySite?.hiddenResortIds));
  }

  /** What is free at one of the resorts on the agency's page. */
  async vacancy(slug: string, resortSlug: string, from: string, to: string): Promise<PublishedVacancy[]> {
    const account = await this.live(slug);
    if (!account) throw Object.assign(new Error("No such site"), { status: 404 });
    const resort = await this.published.sellableResort(account.id, resortSlug);
    if (idList(account.agencySite?.hiddenResortIds).includes(resort.id)) {
      throw Object.assign(new Error("No such resort"), { status: 404 });
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(to ?? ""))) {
      await assertWithinAgentWindow(this.prisma, resort.id, new Date(`${to}T00:00:00.000Z`));
    }
    return this.published.vacancy(resort, from, to);
  }
}
