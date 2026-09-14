/**
 * The published view — everything a stranger may know about a resort
 * (2026-09-14 design, §4).
 *
 * One module, because there are two faces: the resort's own website renders
 * this, and `/v1` will serve it. A price computed in two places is a price with
 * two answers, and the first discount rule anybody edits makes them disagree.
 *
 * It is written as if everything it returns will be read by a stranger, because
 * it will be. What is here is inventory and prices. What is deliberately not
 * here is the register: no room id, no room name, no guest, no booking, and
 * never a reason a room came free.
 */
import { Inject, Injectable } from "@nestjs/common";
import {
  isSiteTemplate,
  roomTypeKeys,
  SITE_TEMPLATES,
  type PublishedPhoto,
  type PublishedResort,
  type PublishedRoomType,
  type PublishedVacancy,
  type SiteTemplate,
} from "@rh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { DiscountService } from "../common/discount.service";
import { PlanLimitsService } from "../common/plan-limits.service";
import { LIVE_STATES } from "../bookings/booking-state";
import { photoUrl } from "./upload.service";
import { badRequest } from "../common/rbac";

/**
 * The longest stay a stranger may ask about in one request.
 *
 * A brochure's date picker spans a holiday, not a parliament. An unbounded
 * range is either a mistake or somebody reading the whole year's occupancy one
 * request at a time, and both are answered the same way.
 */
export const MAX_STAY_NIGHTS = 92;

const dateOnly = (s: string): Date => new Date(`${s}T00:00:00.000Z`);

/** The template a row names, or the first one — a row is never trusted to render. */
const templateOf = (value: unknown): SiteTemplate =>
  isSiteTemplate(value) ? value : SITE_TEMPLATES[0]!.key;

@Injectable()
export class PublishedSiteService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DiscountService) private readonly discounts: DiscountService,
    @Inject(PlanLimitsService) private readonly planLimits: PlanLimitsService,
  ) {}

  /**
   * The resort behind an address, if it is published to the world at all.
   *
   * `null` for every reason a page should not be served — no such address, the
   * owner has not published, the resort is suspended, the plan does not include
   * a website. Deliberately one answer for all four: which of them it is can be
   * read in the panel by the owner, and is nobody else's business.
   */
  private async live(slug: string) {
    const resort = await this.prisma.resort.findUnique({
      where: { slug },
      include: { site: true },
    });
    if (!resort || resort.status !== "active") return null;
    if (!resort.site?.published) return null;
    /**
     * The plan's gate, asked rather than enforced.
     *
     * `requireFeature` is the usual door and it is the wrong one here: it
     * throws a sentence naming the resort's plan, which is fine for the owner
     * and is nobody's business on a public page. A stranger gets one answer for
     * every reason a site is not served.
     */
    if (!(await this.planLimits.hasFeature(resort.id, "website"))) return null;
    return resort;
  }

  async resort(slug: string): Promise<PublishedResort | null> {
    const resort = await this.live(slug);
    if (!resort) return null;
    return this.draw(resort);
  }

  /**
   * The same answer for a resort's own API (2026-09-15 design, §4).
   *
   * One gate lifted and no others: publishing is about the brochure, and a
   * resort with its own website may never want one of ours. Everything else —
   * no room ids, no register, prices from the resort's own records — is exactly
   * as it is for a stranger, because it is the same code.
   */
  async forApi(resortId: number): Promise<PublishedResort> {
    const resort = await this.prisma.resort.findUnique({
      where: { id: resortId },
      include: { site: true },
    });
    if (!resort) throw Object.assign(new Error("No such resort"), { status: 404 });
    return this.draw(resort);
  }

  /** What is free, for a resort's own API — the same rule, without the brochure. */
  async vacancyFor(resortId: number, from: string, to: string): Promise<PublishedVacancy[]> {
    const resort = await this.prisma.resort.findUnique({ where: { id: resortId } });
    if (!resort) throw Object.assign(new Error("No such resort"), { status: 404 });
    return this.countFree(resort.id, from, to);
  }

  private async draw(resort: { id: number; slug: string; name: string; location: string | null; address: string | null; contactPhone: string | null; currency: string; locale: string; checkInTime: string; checkOutTime: string; site: { whatsapp: string | null; headline: string | null; intro: string | null; amenities: unknown; template: string; themeColor: string | null; mapLat: unknown; mapLng: unknown; facebook: string | null; instagram: string | null } | null }): Promise<PublishedResort> {
    /**
     * A resort that has never opened the editor still has an API answer: the
     * words are empty and the rooms and prices are all there, which is the
     * whole of what a site integrating with us actually needs.
     */
    const site = resort.site ?? {
      whatsapp: null, headline: null, intro: null, amenities: null,
      template: SITE_TEMPLATES[0]!.key, themeColor: null, mapLat: null, mapLng: null,
      facebook: null, instagram: null,
    };

    const types = await this.prisma.roomType.findMany({
      where: { resortId: resort.id, active: true },
      orderBy: { id: "asc" },
    });
    const keys = roomTypeKeys(types.map((t) => t.name));

    // one query for every sellable room, rather than one per room type
    const rooms = await this.prisma.room.findMany({
      where: { resortId: resort.id, deletedAt: null, status: "ACTIVE" },
      select: { id: true, roomTypeId: true, baseRate: true },
    });
    const photos = await this.photos(resort.id);

    const roomTypes: PublishedRoomType[] = await Promise.all(
      types.map(async (type, i) => ({
        key: keys[i]!,
        name: type.name,
        sleeps: { adults: type.maxAdults, children: type.maxChildren },
        amenities: stringList(type.amenities),
        photos: photos.get(type.id) ?? [],
        priceFrom: await this.cheapest(
          resort.id,
          rooms.filter((r) => r.roomTypeId === type.id),
        ),
      })),
    );

    return {
      slug: resort.slug,
      name: resort.name,
      location: resort.location,
      address: resort.address,
      contactPhone: resort.contactPhone,
      whatsapp: site.whatsapp,
      headline: site.headline,
      intro: site.intro,
      amenities: stringList(site.amenities),
      template: templateOf(site.template),
      themeColor: site.themeColor,
      map:
        site.mapLat != null && site.mapLng != null
          ? { lat: Number(site.mapLat), lng: Number(site.mapLng) }
          : null,
      social: { facebook: site.facebook, instagram: site.instagram },
      currency: resort.currency,
      locale: resort.locale,
      checkInTime: resort.checkInTime,
      checkOutTime: resort.checkOutTime,
      photos: photos.get(null) ?? [],
      roomTypes,
    };
  }

  /**
   * How many rooms of each kind are free for the whole of a stay.
   *
   * A count and a price, never a room. Free for the *whole* stay: a room taken
   * for one night of three is no use to somebody booking three, and saying
   * otherwise is the "available!" that turns into a phone call and an apology.
   */
  async vacancy(slug: string, fromStr: string, toStr: string): Promise<PublishedVacancy[]> {
    const resort = await this.live(slug);
    if (!resort) throw Object.assign(new Error("No such site"), { status: 404 });
    return this.countFree(resort.id, fromStr, toStr);
  }

  private async countFree(resortId: number, fromStr: string, toStr: string): Promise<PublishedVacancy[]> {
    const resort = { id: resortId };
    const from = dateOnly(fromStr);
    const to = dateOnly(toStr);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw badRequest("Those are not dates");
    }
    if (to <= from) throw badRequest("The second date must be after the first");
    if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_STAY_NIGHTS) {
      throw badRequest(`Ask about at most ${MAX_STAY_NIGHTS} nights at a time`);
    }

    const types = await this.prisma.roomType.findMany({
      where: { resortId: resort.id, active: true },
      orderBy: { id: "asc" },
    });
    const keys = roomTypeKeys(types.map((t) => t.name));

    const rooms = await this.prisma.room.findMany({
      where: { resortId: resort.id, deletedAt: null, status: "ACTIVE" },
      select: { id: true, roomTypeId: true, baseRate: true },
    });

    // the same rule the panel's calendar runs: a night is busy when a live
    // booking holds it, and a cancelled one holds nothing
    const busy = await this.prisma.bookingNight.findMany({
      where: {
        night: { gte: from, lt: to },
        room: { resortId: resort.id },
        item: { booking: { state: { in: LIVE_STATES }, deletedAt: null } },
      },
      select: { roomId: true },
      distinct: ["roomId"],
    });
    const taken = new Set(busy.map((b) => b.roomId));

    return Promise.all(
      types.map(async (type, i) => {
        const free = rooms.filter((r) => r.roomTypeId === type.id && !taken.has(r.id));
        return {
          key: keys[i]!,
          free: free.length,
          priceFrom: await this.cheapest(resort.id, free),
        };
      }),
    );
  }

  /**
   * The cheapest a night among these rooms actually costs, discounts taken off.
   *
   * Per room rather than per type, because an offer can be pinned to one room —
   * so the cheapest room and the cheapest *price* need not be the same room.
   * `null` when there is nothing to sell, which a page shows as "ask us": a
   * missing price is not a free room.
   */
  private async cheapest(
    resortId: number,
    rooms: { id: number; roomTypeId: number; baseRate: unknown }[],
  ): Promise<number | null> {
    if (rooms.length === 0) return null;
    const now = new Date();
    const prices = await Promise.all(
      rooms.map(async (room) => {
        const rent = Number(room.baseRate);
        const off = await this.discounts.bestFor(resortId, room.roomTypeId, rent, now, room.id);
        return rent - off;
      }),
    );
    return Math.min(...prices);
  }

  /** Every photograph the resort published, by the room type it belongs to. */
  private async photos(resortId: number): Promise<Map<number | null, PublishedPhoto[]>> {
    const rows = await this.prisma.resortPhoto.findMany({
      where: { resortId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { upload: { select: { path: true, width: true, height: true } } },
    });
    const byType = new Map<number | null, PublishedPhoto[]>();
    for (const row of rows) {
      const list = byType.get(row.roomTypeId) ?? [];
      list.push({
        // a path, not an id: the storage root is deployment configuration and
        // has no business in a public response
        url: photoUrl(row.upload.path),
        alt: row.alt,
        width: row.upload.width,
        height: row.upload.height,
      });
      byType.set(row.roomTypeId, list);
    }
    return byType;
  }
}

/** A JSON column holds whatever was written into it. */
function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
