/**
 * What an agency may say about itself to a stranger (2026-09-17 design, §1).
 *
 * An agency owns no rooms. Its page — and its API — is the agency, the resorts
 * it is approved to sell and its tour packages. Every resort is drawn by the
 * resort's own published view (`PublishedSiteService.forApi`), so an agency can
 * never quote a room differently from the resort, with one deliberate cut: a
 * price appears only where the resort shares its rates with agents. Publishing
 * a number the resort keeps from its agents would be the agency deciding it
 * for them.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { AgencyPublished, AgencyResort, AgencyTour, PublishedVacancy } from "@rh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PublishedSiteService } from "./published-site.service";
import { agencyOf, sellableFor } from "../common/selling-access";
import { bookableUntil } from "../common/agent-window";
import { photoUrl } from "./upload.service";

/** The person an agency account books as: its owner, not one of its staff. */
export async function ownerOfAccount(
  prisma: PrismaService,
  accountId: number,
): Promise<{ id: number } | null> {
  return prisma.user.findFirst({
    where: { accountId, role: "AGENT", parentAgentId: null },
    orderBy: { id: "asc" },
    select: { id: true },
  });
}

@Injectable()
export class AgencyPublishedService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PublishedSiteService) private readonly published: PublishedSiteService,
  ) {}

  /**
   * The resorts this account may sell right now, by the selling rule.
   *
   * Asked of the owner, because an agency that is pending or suspended sells
   * nothing — and a page listing resorts it cannot book is a page that ends in
   * an apology.
   */
  async sellableResortIds(accountId: number): Promise<number[]> {
    const owner = await ownerOfAccount(this.prisma, accountId);
    if (!owner) return [];
    const agency = await agencyOf(this.prisma, owner.id);
    if (agency.refusal) return [];
    return sellableFor(this.prisma, accountId);
  }

  /** One resort the agency sells, by its address, or 404 for every other reason. */
  async sellableResort(accountId: number, slug: string) {
    const resort = await this.prisma.resort.findUnique({
      where: { slug: String(slug ?? "") },
      select: { id: true, slug: true, timezone: true, agentBookingWindowDays: true, showRatesToAgents: true },
    });
    if (!resort || !(await this.sellableResortIds(accountId)).includes(resort.id)) {
      throw Object.assign(new Error("No such resort"), { status: 404 });
    }
    return resort;
  }

  async draw(accountId: number, hidden: number[] = []): Promise<AgencyPublished> {
    const account = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: accountId },
      select: { name: true, slug: true, agencySite: true },
    });
    const site = account.agencySite;
    const photos = await this.prisma.agencyPhoto.findMany({
      where: { accountId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { upload: { select: { path: true, width: true, height: true } } },
    });
    const ids = (await this.sellableResortIds(accountId)).filter((id) => !hidden.includes(id));
    const rows = await this.prisma.resort.findMany({
      where: { id: { in: ids } },
      select: { id: true, timezone: true, agentBookingWindowDays: true, showRatesToAgents: true },
      orderBy: { id: "asc" },
    });

    const resorts: AgencyResort[] = [];
    for (const row of rows) {
      const view = await this.published.forApi(row.id);
      resorts.push({
        slug: view.slug,
        name: view.name,
        location: view.location,
        currency: view.currency,
        locale: view.locale,
        checkInTime: view.checkInTime,
        checkOutTime: view.checkOutTime,
        photos: view.photos,
        roomTypes: view.roomTypes.map((t) => ({ ...t, priceFrom: row.showRatesToAgents ? t.priceFrom : null })),
        bookableUntil: bookableUntil(row)?.toISOString().slice(0, 10) ?? null,
      });
    }

    return {
      agency: {
        slug: account.slug,
        name: account.name,
        headline: site?.headline ?? null,
        intro: site?.intro ?? null,
        phone: site?.phone ?? null,
        email: site?.email ?? null,
        whatsapp: site?.whatsapp ?? null,
        address: site?.address ?? null,
        themeColor: site?.themeColor ?? null,
        social: { facebook: site?.facebook ?? null, instagram: site?.instagram ?? null },
        photos: photos.map((p) => ({
          url: photoUrl(p.upload.path),
          alt: p.alt,
          width: p.upload.width,
          height: p.upload.height,
        })),
      },
      resorts,
      tours: await this.tours(accountId),
    };
  }

  /** What is free at a resort the agency sells, priced as the resort lets agents see. */
  async vacancy(resort: { id: number; showRatesToAgents: boolean }, from: string, to: string): Promise<PublishedVacancy[]> {
    const free = await this.published.vacancyFor(resort.id, from, to);
    return free.map((v) => ({ ...v, priceFrom: resort.showRatesToAgents ? v.priceFrom : null }));
  }

  /** The agency's live packages, each with one price and none of its cost lines. */
  private async tours(accountId: number): Promise<AgencyTour[]> {
    const owner = await ownerOfAccount(this.prisma, accountId);
    if (!owner) return [];
    const packages = await this.prisma.tourPackage.findMany({
      where: { agencyId: owner.id, active: true },
      orderBy: { id: "asc" },
      include: { items: { select: { qty: true, unitPrice: true } } },
    });
    return packages.map((p) => ({
      id: p.id,
      name: p.name,
      summary: p.summary,
      days: p.days,
      nights: p.nights,
      pax: p.pax,
      price: Math.round(p.items.reduce((sum, i) => sum + Number(i.qty) * Number(i.unitPrice), 0) * 100) / 100,
    }));
  }
}
