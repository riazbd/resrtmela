/**
 * The editor behind a resort's site (2026-09-14 design, §5.3).
 *
 * The other half of `PublishedSiteService`: that one answers a stranger, this
 * one answers the owner. They meet at one row and they are deliberately not the
 * same module, because almost everything differs — who may call it, what a
 * refusal is allowed to say, and whether a missing plan feature is a silence or
 * a sentence.
 */
import { Inject, Injectable } from "@nestjs/common";
import { isSiteTemplate, RESERVED_RESORT_SLUGS, siteSlug, SITE_TEMPLATES, type JwtClaims } from "@rh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../common/permissions";
import { PlanLimitsService } from "../common/plan-limits.service";
import { AuditService } from "../common/audit.service";
import { badRequest, requireResortAccess } from "../common/rbac";
import { photoUrl, RESORT_UPLOAD_QUOTA, UploadService } from "./upload.service";
import { SiteCacheService } from "./site-cache.service";

/** What the editor screen is given to draw itself with. */
export interface SiteDraft {
  slug: string;
  published: boolean;
  publishedAt: Date | null;
  template: string;
  headline: string | null;
  intro: string | null;
  amenities: string[];
  themeColor: string | null;
  map: { lat: number; lng: number } | null;
  whatsapp: string | null;
  facebook: string | null;
  instagram: string | null;
  photos: {
    id: number;
    url: string;
    roomTypeId: number | null;
    alt: string | null;
    sortOrder: number;
  }[];
  /** the shelf, so the screen never carries its own copy of the list */
  templates: typeof SITE_TEMPLATES;
  storage: { used: number; quota: number };
}

/** Everything the owner may write. Each field is optional; absent means unchanged. */
export interface SiteEdit {
  template?: string;
  headline?: string | null;
  intro?: string | null;
  amenities?: string[];
  themeColor?: string | null;
  mapLat?: number | null;
  mapLng?: number | null;
  whatsapp?: string | null;
  facebook?: string | null;
  instagram?: string | null;
}

@Injectable()
export class SiteEditorService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UploadService) private readonly uploads: UploadService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
    @Inject(PlanLimitsService) private readonly planLimits: PlanLimitsService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SiteCacheService) private readonly cache: SiteCacheService,
  ) {}

  /**
   * The website is told, and is never allowed to hold anything up.
   *
   * Awaited rather than dropped so a failure is logged in order, but
   * `SiteCacheService` swallows its own errors: the owner's change is already
   * saved, and a briefly stale page is a better outcome than an error on a save
   * that worked.
   */
  private async touched(resortId: number): Promise<void> {
    const resort = await this.prisma.resort.findUnique({
      where: { id: resortId },
      select: { slug: true },
    });
    if (resort) await this.cache.changed(resort.slug);
  }

  /** Changing what the world sees of this resort is changing the resort. */
  private async mine(claims: JwtClaims, resortId: number): Promise<void> {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "settings.manage");
  }

  /**
   * The row, made on the way in.
   *
   * Created rather than defaulted, because everything downstream — the photos,
   * the publish flag, the template — hangs off it, and a screen that has to
   * cope with "no row yet" is a screen with two of every code path.
   */
  private async row(resortId: number) {
    return this.prisma.resortSite.upsert({
      where: { resortId },
      create: { resortId },
      update: {},
    });
  }

  async get(claims: JwtClaims, resortId: number): Promise<SiteDraft> {
    await this.mine(claims, resortId);
    const site = await this.row(resortId);
    const resort = await this.prisma.resort.findUniqueOrThrow({
      where: { id: resortId },
      select: { slug: true },
    });
    const photos = await this.prisma.resortPhoto.findMany({
      where: { resortId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { upload: { select: { path: true } } },
    });

    return {
      slug: resort.slug,
      published: site.published,
      publishedAt: site.publishedAt,
      template: site.template,
      headline: site.headline,
      intro: site.intro,
      amenities: stringList(site.amenities),
      themeColor: site.themeColor,
      map:
        site.mapLat != null && site.mapLng != null
          ? { lat: Number(site.mapLat), lng: Number(site.mapLng) }
          : null,
      whatsapp: site.whatsapp,
      facebook: site.facebook,
      instagram: site.instagram,
      photos: photos.map((p) => ({
        id: p.id,
        url: photoUrl(p.upload.path),
        roomTypeId: p.roomTypeId,
        alt: p.alt,
        sortOrder: p.sortOrder,
      })),
      templates: SITE_TEMPLATES,
      storage: { used: await this.uploads.used(resortId), quota: RESORT_UPLOAD_QUOTA },
    };
  }

  async save(claims: JwtClaims, resortId: number, edit: SiteEdit): Promise<SiteDraft> {
    await this.mine(claims, resortId);
    await this.row(resortId);

    if (edit.template !== undefined && !isSiteTemplate(edit.template)) {
      throw badRequest(`"${edit.template}" is not one of the designs on offer.`);
    }
    // both or neither: half a coordinate is a point on the equator or on the
    // Greenwich meridian, and either is a map pin in the sea
    if (edit.mapLat != null || edit.mapLng != null) {
      const lat = edit.mapLat;
      const lng = edit.mapLng;
      if (lat == null || lng == null) throw badRequest("A map point needs both numbers.");
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw badRequest("That latitude is not on Earth.");
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw badRequest("That longitude is not on Earth.");
    }

    await this.prisma.resortSite.update({
      where: { resortId },
      data: {
        ...(edit.template !== undefined ? { template: edit.template } : {}),
        ...(edit.headline !== undefined ? { headline: trimOrNull(edit.headline, 160) } : {}),
        ...(edit.intro !== undefined ? { intro: trimOrNull(edit.intro, 4000) } : {}),
        ...(edit.amenities !== undefined ? { amenities: cleanAmenities(edit.amenities) as never } : {}),
        ...(edit.themeColor !== undefined ? { themeColor: colorOrNull(edit.themeColor) } : {}),
        ...(edit.mapLat !== undefined ? { mapLat: edit.mapLat as never } : {}),
        ...(edit.mapLng !== undefined ? { mapLng: edit.mapLng as never } : {}),
        ...(edit.whatsapp !== undefined ? { whatsapp: trimOrNull(edit.whatsapp, 32) } : {}),
        ...(edit.facebook !== undefined ? { facebook: trimOrNull(edit.facebook, 191) } : {}),
        ...(edit.instagram !== undefined ? { instagram: trimOrNull(edit.instagram, 191) } : {}),
      },
    });
    await this.touched(resortId);
    return this.get(claims, resortId);
  }

  /**
   * The address, changed.
   *
   * Taken from whatever the owner typed rather than used verbatim: this is the
   * string in front of somebody's business, and a space or a capital letter in
   * it is a link that does not work. Refused rather than numbered when it is
   * somebody else's — at signup a number is kinder than an error, but an owner
   * deliberately choosing an address needs to be told they cannot have that one.
   */
  async setSlug(claims: JwtClaims, resortId: number, wanted: string): Promise<{ slug: string }> {
    await this.mine(claims, resortId);
    const slug = siteSlug(wanted);
    if (RESERVED_RESORT_SLUGS.includes(slug)) {
      throw badRequest(`"${slug}" is reserved — it is where agencies' pages live. Pick another address.`);
    }
    const previous = await this.prisma.resort.findUniqueOrThrow({
      where: { id: resortId },
      select: { slug: true },
    });
    const taken = await this.prisma.resort.findUnique({ where: { slug }, select: { id: true } });
    if (taken && taken.id !== resortId) {
      throw Object.assign(new Error(`"${slug}" is already somebody else's address.`), { status: 409 });
    }
    await this.prisma.resort.update({ where: { id: resortId }, data: { slug } });
    await this.audit.log({
      actorId: claims.userId,
      resortId,
      action: "site.address",
      entity: "resort",
      entityId: resortId,
      diff: { slug },
    });
    // both addresses: the old page should stop being served from cache as
    // surely as the new one starts
    await this.cache.changed(previous.slug);
    await this.cache.changed(slug);
    return { slug };
  }

  /**
   * Live, or not.
   *
   * Going live needs the plan and the refusal names it — the owner is the one
   * person who should be told what to buy. Coming down never does: a resort
   * whose plan has lapsed, or who has simply changed their mind, must be able
   * to close its own front door without asking the platform for help.
   */
  async publish(claims: JwtClaims, resortId: number, live: boolean): Promise<SiteDraft> {
    await this.mine(claims, resortId);
    await this.row(resortId);
    if (live) await this.planLimits.requireFeature(resortId, "website");

    await this.prisma.resortSite.update({
      where: { resortId },
      data: { published: live, publishedAt: live ? new Date() : null },
    });
    await this.audit.log({
      actorId: claims.userId,
      resortId,
      action: live ? "site.publish" : "site.unpublish",
      entity: "resort",
      entityId: resortId,
    });
    await this.touched(resortId);
    return this.get(claims, resortId);
  }

  async addPhoto(
    claims: JwtClaims,
    resortId: number,
    bytes: Buffer,
    mediaType: string,
    where: { roomTypeId?: number | null; alt?: string | null },
  ): Promise<{ id: number; url: string }> {
    await this.mine(claims, resortId);
    await this.row(resortId);

    if (where.roomTypeId != null) {
      // a room type from another resort would hang this resort's picture on
      // somebody else's page, and read as a harmless id in the request
      const type = await this.prisma.roomType.findFirst({
        where: { id: where.roomTypeId, resortId },
        select: { id: true },
      });
      if (!type) throw badRequest("That is not a room type of this resort.");
    }

    const upload = await this.uploads.put(resortId, claims.userId, bytes, mediaType);
    const last = await this.prisma.resortPhoto.aggregate({
      where: { resortId },
      _max: { sortOrder: true },
    });
    const photo = await this.prisma.resortPhoto.create({
      data: {
        resortId,
        roomTypeId: where.roomTypeId ?? null,
        uploadId: upload.id,
        alt: trimOrNull(where.alt ?? null, 191),
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
    });
    await this.touched(resortId);
    return { id: photo.id, url: photoUrl(upload.path) };
  }

  /** Puts a picture at a position, and closes the gap it left behind. */
  async movePhoto(claims: JwtClaims, resortId: number, photoId: number, to: number): Promise<SiteDraft> {
    await this.mine(claims, resortId);
    const photos = await this.prisma.resortPhoto.findMany({
      where: { resortId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    const from = photos.findIndex((p) => p.id === photoId);
    if (from === -1) throw Object.assign(new Error("No such picture"), { status: 404 });

    const order = photos.map((p) => p.id);
    const [moved] = order.splice(from, 1);
    order.splice(Math.max(0, Math.min(to, order.length)), 0, moved!);
    // rewritten whole rather than shuffled: the positions are a list, and a
    // list that is only ever written entire cannot develop two of a number
    await this.prisma.$transaction(
      order.map((id, i) =>
        this.prisma.resortPhoto.update({ where: { id }, data: { sortOrder: i } }),
      ),
    );
    await this.touched(resortId);
    return this.get(claims, resortId);
  }

  async removePhoto(claims: JwtClaims, resortId: number, photoId: number): Promise<{ removed: true }> {
    await this.mine(claims, resortId);
    const photo = await this.prisma.resortPhoto.findFirst({
      where: { id: photoId, resortId },
      select: { id: true, uploadId: true },
    });
    if (!photo) throw Object.assign(new Error("No such picture"), { status: 404 });

    await this.prisma.resortPhoto.delete({ where: { id: photo.id } });
    /**
     * The file goes only when nothing else points at it. The same picture used
     * as the cover and on a room type is one file by design, and deleting one
     * of the two must not break the other.
     */
    const stillUsed = await this.prisma.resortPhoto.count({ where: { uploadId: photo.uploadId } });
    if (stillUsed === 0) await this.uploads.remove(resortId, photo.uploadId);
    await this.touched(resortId);
    return { removed: true };
  }
}

const trimOrNull = (v: string | null, max: number): string | null => {
  const t = (v ?? "").trim();
  if (t === "") return null;
  if (t.length > max) throw badRequest(`That is too long — at most ${max} characters.`);
  return t;
};

/** A colour the page can actually paint with, or nothing. */
const colorOrNull = (v: string | null): string | null => {
  const t = (v ?? "").trim();
  if (t === "") return null;
  if (!/^#[0-9a-f]{6}$/i.test(t)) throw badRequest("A colour looks like #0f5132.");
  return t.toLowerCase();
};

const cleanAmenities = (list: string[]): string[] =>
  list
    .map((a) => String(a).trim())
    .filter((a) => a.length > 0 && a.length <= 60)
    .slice(0, 40);

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
