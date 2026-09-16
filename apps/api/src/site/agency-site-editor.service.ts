/**
 * The editor behind an agency's own page (2026-09-17 design, §1).
 *
 * The agency's side of `AgencyPublicSiteService`, and deliberately the same
 * shape as a resort's editor: the owner writes the words and the pictures,
 * publishing needs the plan and names it, and taking the page down never does.
 * What the agency does not write is the resorts and the tours — those are read
 * from the records every time, so the page cannot quote a room differently from
 * the resort that owns it.
 */
import { Inject, Injectable } from "@nestjs/common";
import { ROLE, siteSlug, type AgencyResort, type JwtClaims } from "@rh/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../common/permissions";
import { PlanLimitsService } from "../common/plan-limits.service";
import { AuditService } from "../common/audit.service";
import { agencyOf } from "../common/selling-access";
import { badRequest, forbid } from "../common/rbac";
import { AGENCY_UPLOAD_QUOTA, photoUrl, UploadService } from "./upload.service";
import { SiteCacheService } from "./site-cache.service";
import { AgencyPublishedService } from "./agency-published.service";

/** What the editor screen draws itself with. */
export interface AgencySiteDraft {
  slug: string;
  name: string;
  published: boolean;
  publishedAt: Date | null;
  headline: string | null;
  intro: string | null;
  themeColor: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  address: string | null;
  facebook: string | null;
  instagram: string | null;
  hiddenResortIds: number[];
  /** every resort the agency sells, with its id, so the screen can offer to hide one */
  resorts: (Pick<AgencyResort, "slug" | "name" | "location"> & { id: number })[];
  photos: { id: number; url: string; alt: string | null; sortOrder: number }[];
  storage: { used: number; quota: number };
}

/** Everything the agency may write. Absent means unchanged. */
export interface AgencySiteEdit {
  headline?: string | null;
  intro?: string | null;
  themeColor?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  hiddenResortIds?: number[];
}

@Injectable()
export class AgencySiteEditorService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UploadService) private readonly uploads: UploadService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
    @Inject(PlanLimitsService) private readonly planLimits: PlanLimitsService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SiteCacheService) private readonly cache: SiteCacheService,
    // which resorts the agency sells is the selling rule, asked of the one
    // service that answers it for the page; nothing here prices a room
    @Inject(AgencyPublishedService) private readonly published: AgencyPublishedService,
  ) {}

  /** The agency this person edits the page of. */
  private async mine(claims: JwtClaims): Promise<number> {
    if (claims.role !== ROLE.AGENT) throw forbid("Agencies only");
    await this.perms.require(claims, undefined, "agent.website.manage");
    const { accountId } = await agencyOf(this.prisma, claims.userId);
    if (accountId == null) throw forbid("This agent has no agency account.");
    return accountId;
  }

  private row(accountId: number) {
    return this.prisma.agencySite.upsert({ where: { accountId }, create: { accountId }, update: {} });
  }

  private async touched(accountId: number, slug?: string): Promise<void> {
    const account = slug ?? (await this.prisma.tenant.findUnique({ where: { id: accountId }, select: { slug: true } }))?.slug;
    if (account) await this.cache.changedAgency(account);
  }

  async get(claims: JwtClaims): Promise<AgencySiteDraft> {
    return this.draft(await this.mine(claims));
  }

  private async draft(accountId: number): Promise<AgencySiteDraft> {
    const site = await this.row(accountId);
    const account = await this.prisma.tenant.findUniqueOrThrow({ where: { id: accountId }, select: { slug: true, name: true } });
    const ids = await this.published.sellableResortIds(accountId);
    const resorts = await this.prisma.resort.findMany({
      where: { id: { in: ids } },
      select: { id: true, slug: true, name: true, location: true },
      orderBy: { id: "asc" },
    });
    const photos = await this.prisma.agencyPhoto.findMany({
      where: { accountId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { upload: { select: { path: true } } },
    });
    return {
      slug: account.slug,
      name: account.name,
      published: site.published,
      publishedAt: site.publishedAt,
      headline: site.headline,
      intro: site.intro,
      themeColor: site.themeColor,
      phone: site.phone,
      email: site.email,
      whatsapp: site.whatsapp,
      address: site.address,
      facebook: site.facebook,
      instagram: site.instagram,
      hiddenResortIds: idList(site.hiddenResortIds),
      resorts,
      photos: photos.map((p) => ({ id: p.id, url: photoUrl(p.upload.path), alt: p.alt, sortOrder: p.sortOrder })),
      storage: { used: await this.uploads.usedBy({ accountId }), quota: AGENCY_UPLOAD_QUOTA },
    };
  }

  async save(claims: JwtClaims, edit: AgencySiteEdit): Promise<AgencySiteDraft> {
    const accountId = await this.mine(claims);
    await this.row(accountId);

    let hidden: number[] | undefined;
    if (edit.hiddenResortIds !== undefined) {
      if (!Array.isArray(edit.hiddenResortIds)) throw badRequest("Say which resorts to hide as a list.");
      // only resorts it sells: anything else is a stale id or a guess, and storing it says nothing true
      const sold = new Set(await this.published.sellableResortIds(accountId));
      hidden = [...new Set(edit.hiddenResortIds.map(Number))].filter((id) => sold.has(id));
    }

    await this.prisma.agencySite.update({
      where: { accountId },
      data: {
        ...(edit.headline !== undefined ? { headline: trimOrNull(edit.headline, 160) } : {}),
        ...(edit.intro !== undefined ? { intro: trimOrNull(edit.intro, 4000) } : {}),
        ...(edit.themeColor !== undefined ? { themeColor: colorOrNull(edit.themeColor) } : {}),
        ...(edit.phone !== undefined ? { phone: trimOrNull(edit.phone, 32) } : {}),
        ...(edit.email !== undefined ? { email: emailOrNull(edit.email) } : {}),
        ...(edit.whatsapp !== undefined ? { whatsapp: trimOrNull(edit.whatsapp, 32) } : {}),
        ...(edit.address !== undefined ? { address: trimOrNull(edit.address, 255) } : {}),
        ...(edit.facebook !== undefined ? { facebook: trimOrNull(edit.facebook, 191) } : {}),
        ...(edit.instagram !== undefined ? { instagram: trimOrNull(edit.instagram, 191) } : {}),
        ...(hidden !== undefined ? { hiddenResortIds: hidden as never } : {}),
      },
    });
    await this.touched(accountId);
    return this.draft(accountId);
  }

  /**
   * The address, changed — the account's own slug.
   *
   * Refused rather than numbered when it is somebody else's: an owner choosing
   * an address deliberately needs to be told they cannot have that one.
   */
  async setSlug(claims: JwtClaims, wanted: string): Promise<{ slug: string }> {
    const accountId = await this.mine(claims);
    const slug = siteSlug(wanted);
    const previous = await this.prisma.tenant.findUniqueOrThrow({ where: { id: accountId }, select: { slug: true } });
    const taken = await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (taken && taken.id !== accountId) {
      throw Object.assign(new Error(`"${slug}" is already somebody else's address.`), { status: 409 });
    }
    await this.prisma.tenant.update({ where: { id: accountId }, data: { slug } });
    await this.audit.log({ actorId: claims.userId, action: "agency.site.address", entity: "tenant", entityId: accountId, diff: { slug } });
    await this.touched(accountId, previous.slug);
    await this.touched(accountId, slug);
    return { slug };
  }

  /** Live needs the plan and names it; coming down never does. */
  async publish(claims: JwtClaims, live: boolean): Promise<AgencySiteDraft> {
    const accountId = await this.mine(claims);
    await this.row(accountId);
    if (live) await this.planLimits.requireAccountFeature(accountId, "agency_website");

    await this.prisma.agencySite.update({
      where: { accountId },
      data: { published: live, publishedAt: live ? new Date() : null },
    });
    await this.audit.log({
      actorId: claims.userId,
      action: live ? "agency.site.publish" : "agency.site.unpublish",
      entity: "tenant",
      entityId: accountId,
    });
    await this.touched(accountId);
    return this.draft(accountId);
  }

  async addPhoto(
    claims: JwtClaims,
    bytes: Buffer,
    mediaType: string,
    meta: { alt?: string | null },
  ): Promise<{ id: number; url: string }> {
    const accountId = await this.mine(claims);
    await this.row(accountId);
    const upload = await this.uploads.putForAccount(accountId, claims.userId, bytes, mediaType);
    const last = await this.prisma.agencyPhoto.aggregate({ where: { accountId }, _max: { sortOrder: true } });
    const photo = await this.prisma.agencyPhoto.create({
      data: {
        accountId,
        uploadId: upload.id,
        alt: trimOrNull(meta.alt ?? null, 191),
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
    });
    await this.touched(accountId);
    return { id: photo.id, url: photoUrl(upload.path) };
  }

  /** Puts a picture at a position; the first is the cover. */
  async movePhoto(claims: JwtClaims, photoId: number, to: number): Promise<AgencySiteDraft> {
    const accountId = await this.mine(claims);
    const photos = await this.prisma.agencyPhoto.findMany({
      where: { accountId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    const from = photos.findIndex((p) => p.id === photoId);
    if (from === -1) throw Object.assign(new Error("No such picture"), { status: 404 });
    const order = photos.map((p) => p.id);
    const [moved] = order.splice(from, 1);
    order.splice(Math.max(0, Math.min(to, order.length)), 0, moved!);
    await this.prisma.$transaction(
      order.map((id, i) => this.prisma.agencyPhoto.update({ where: { id }, data: { sortOrder: i } })),
    );
    await this.touched(accountId);
    return this.draft(accountId);
  }

  async removePhoto(claims: JwtClaims, photoId: number): Promise<{ removed: true }> {
    const accountId = await this.mine(claims);
    const photo = await this.prisma.agencyPhoto.findFirst({ where: { id: photoId, accountId }, select: { id: true, uploadId: true } });
    if (!photo) throw Object.assign(new Error("No such picture"), { status: 404 });
    await this.prisma.agencyPhoto.delete({ where: { id: photo.id } });
    // the file goes only when nothing else points at it
    if ((await this.prisma.agencyPhoto.count({ where: { uploadId: photo.uploadId } })) === 0) {
      await this.uploads.removeFor({ accountId }, photo.uploadId);
    }
    await this.touched(accountId);
    return { removed: true };
  }
}

export function idList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((v): v is number => Number.isInteger(v)) : [];
}

const trimOrNull = (v: string | null, max: number): string | null => {
  const t = (v ?? "").trim();
  if (t === "") return null;
  if (t.length > max) throw badRequest(`That is too long — at most ${max} characters.`);
  return t;
};

const colorOrNull = (v: string | null): string | null => {
  const t = (v ?? "").trim();
  if (t === "") return null;
  if (!/^#[0-9a-f]{6}$/i.test(t)) throw badRequest("A colour looks like #0f5132.");
  return t.toLowerCase();
};

const emailOrNull = (v: string | null): string | null => {
  const t = trimOrNull(v, 191);
  if (t == null) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) throw badRequest("That is not an email address.");
  return t.toLowerCase();
};
