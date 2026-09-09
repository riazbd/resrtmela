/**
 * A resort's own words to its own guests.
 *
 * Every message used to go out in wording compiled into the build. A resort
 * could not change a syllable of what reached their guest under their own
 * name — could not add their check-in time, could not write it in Bangla,
 * could not soften a payment reminder for a repeat customer. "Nothing
 * hardcoded" has to reach this, or it means very little: this is the part of
 * the product the guest actually sees.
 *
 * The built-in wording stays as the fallback rather than being copied into
 * every new resort's rows. Two reasons: a resort works on day one without
 * writing eight messages first, and a fix to the default wording reaches
 * everyone who has not deliberately overridden it.
 */
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../common/permissions";
import { requireResortAccess, badRequest } from "../common/rbac";
import { TEMPLATES, GUEST_TEMPLATES, placeholdersOf, type TemplateName } from "./templates";
import type { JwtClaims } from "@rh/shared";

export interface TemplateView {
  name: TemplateName;
  body: string;
  /** true when this resort has written its own */
  custom: boolean;
  /** what the message can be given, so the editor can show it */
  placeholders: string[];
}

@Injectable()
export class TemplatesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
  ) {}

  /**
   * The wording to use, right now, for this resort.
   *
   * Called on the sending path, so a missing row is the common case and must
   * cost nothing more than one indexed lookup.
   */
  async render(
    resortId: number | null | undefined,
    name: TemplateName,
    data: Record<string, string | number | null | undefined>,
  ): Promise<string> {
    const body = (await this.bodyFor(resortId, name)) ?? TEMPLATES[name];
    return body.replace(/\{(\w+)\}/g, (_, key: string) => {
      const v = data[key];
      return v === null || v === undefined ? "?" : String(v);
    });
  }

  private async bodyFor(resortId: number | null | undefined, name: TemplateName): Promise<string | null> {
    if (resortId == null || !isGuestTemplate(name)) return null;
    const row = await this.prisma.messageTemplate.findUnique({
      where: { resortId_name: { resortId, name } },
      select: { body: true },
    });
    return row?.body ?? null;
  }

  /** Every editable message, with the resort's wording where it has one. */
  async list(claims: JwtClaims, resortId: number): Promise<TemplateView[]> {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "settings.manage");
    const rows = await this.prisma.messageTemplate.findMany({ where: { resortId } });
    const custom = new Map(rows.map((r) => [r.name, r.body]));
    return GUEST_TEMPLATES.map((name) => ({
      name,
      body: custom.get(name) ?? TEMPLATES[name],
      custom: custom.has(name),
      placeholders: placeholdersOf(TEMPLATES[name]),
    }));
  }

  async save(claims: JwtClaims, resortId: number, name: TemplateName, input: { body: string }) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "settings.manage");
    if (!isGuestTemplate(name)) {
      // the platform's own notices about an unpaid subscription are not the
      // tenant's to rewrite
      throw badRequest(`"${name}" is not a message you can change`);
    }
    const body = input.body?.trim();
    if (!body) throw badRequest("The message cannot be empty");
    if (body.length > 600) throw badRequest("The message is too long (600 characters max)");

    /**
     * A placeholder the message will never be given renders as "?" in front of
     * a guest, and the resort finds out from the guest. Rejecting it here is
     * the only moment anybody is looking.
     */
    const allowed = placeholdersOf(TEMPLATES[name]);
    const unknown = placeholdersOf(body).filter((p) => !allowed.includes(p));
    if (unknown.length > 0) {
      throw badRequest(
        `This message has no ${unknown.map((u) => `{${u}}`).join(", ")}. Available: ${allowed
          .map((a) => `{${a}}`)
          .join(", ")}`,
      );
    }

    return this.prisma.messageTemplate.upsert({
      where: { resortId_name: { resortId, name } },
      create: { resortId, name, body },
      update: { body },
    });
  }

  /** Back to the built-in wording. */
  async reset(claims: JwtClaims, resortId: number, name: TemplateName) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "settings.manage");
    await this.prisma.messageTemplate.deleteMany({ where: { resortId, name } });
    return { reset: true, body: TEMPLATES[name] };
  }
}

function isGuestTemplate(name: string): name is TemplateName {
  return (GUEST_TEMPLATES as readonly string[]).includes(name);
}
