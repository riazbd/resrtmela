/**
 * The lists a resort owns.
 *
 * Payment methods, booking sources and activity categories were Prisma enums,
 * which made each of them a fact about the software: a resort that started
 * taking Rocket, or selling through a channel nobody had thought of, needed a
 * migration and a deploy. They are rows now, and one service serves all of
 * them — the alternative was a table, a service, a controller and a screen per
 * list, paid for six times over and drifting apart afterwards.
 *
 * Seeding happens on first read rather than at resort creation. There are four
 * places a resort can be created and remembering all four is exactly the kind
 * of thing that rots; a lazy, idempotent fill also covers every resort that
 * existed before its list did.
 */
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PlatformSettingsService } from "../common/platform-settings.service";
import { PermissionsService } from "../common/permissions";
import { AuditService } from "../common/audit.service";
import { badRequest, notFound, requireResortAccess } from "../common/rbac";
import { requireSellingAccess } from "../common/selling-access";
import { ROLE, type JwtClaims } from "@rh/shared";
import {
  OPTION_LISTS,
  OPTION_CODE_RE,
  defaultsSettingKey,
  parseOptionSeeds,
  type OptionList,
} from "./registry";

@Injectable()
export class OptionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
    @Inject(PermissionsService) private readonly perms: PermissionsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Fill this resort's copy of a list from the platform defaults, once. */
  private async ensureSeeded(resortId: number, list: OptionList): Promise<void> {
    const existing = await this.prisma.resortOption.count({ where: { resortId, list } });
    if (existing > 0) return;
    const all = await this.settings.all();
    const seeds = parseOptionSeeds(list, all[defaultsSettingKey(list)]);
    await this.prisma.resortOption.createMany({
      data: seeds.map((m, i) => ({
        resortId,
        list,
        code: m.code,
        label: m.label,
        sortOrder: i,
        ...(m.meta ? { meta: m.meta as never } : {}),
      })),
      skipDuplicates: true,
    });
  }

  /** Everything in the list, switched-off rows included — the settings view. */
  async list(claims: JwtClaims, resortId: number, list: OptionList) {
    /**
     * An agency selling this resort reads these too, to fill its own
     * dropdowns — how a booking was taken, where it came from. They are
     * labels, not the resort's business, and changing them stays behind
     * `settings.manage` on the screen below.
     */
    if (claims.role === ROLE.AGENT) {
      await requireSellingAccess(this.prisma, claims, resortId);
    } else {
      requireResortAccess(claims, resortId);
      await this.perms.require(claims, resortId, "settings.manage");
    }
    await this.ensureSeeded(resortId, list);
    return this.prisma.resortOption.findMany({
      where: { resortId, list },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
  }

  /** What a dropdown should offer today. No permission of its own: a list of
   *  labels is not a secret, and every caller has already been let in. */
  async active(resortId: number, list: OptionList) {
    await this.ensureSeeded(resortId, list);
    return this.prisma.resortOption.findMany({
      where: { resortId, list, active: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
  }

  /** One row, or null — for code that needs a value's rules out of `meta`. */
  async find(resortId: number, list: OptionList, code: string) {
    await this.ensureSeeded(resortId, list);
    return this.prisma.resortOption.findUnique({
      where: { resortId_list_code: { resortId, list, code } },
    });
  }

  /**
   * The guard every write goes through.
   *
   * `@IsEnum(PaymentMethod)` used to accept BKASH for a resort that has never
   * taken bKash, because the enum was global. The question is per resort, so
   * the check is too.
   */
  async assertAccepted(resortId: number, list: OptionList, code: string): Promise<void> {
    if ((OPTION_LISTS[list].reserved as readonly string[]).includes(code)) return;
    const row = await this.find(resortId, list, code);
    if (!row || !row.active) {
      throw badRequest(`"${code}" is not on this resort's ${OPTION_LISTS[list].label.toLowerCase()} list`);
    }
  }

  /**
   * Records `code` on the list if it is not there yet, and returns it either way.
   *
   * For lists a resort writes as it works rather than sets up in advance.
   * Expense categories are the case: the live resort has forty-nine of them
   * across seventy-eight expenses — "টমেটো", "পটল", "বাঁশ কোরাল" — because the
   * category box is where the front desk types what was bought. Refusing an
   * unknown one, the way `assertAccepted` does for payment methods, would stop
   * somebody recording a purchase until an owner opened Settings, which is a
   * worse day than the typos it prevents.
   *
   * The management asked for is in Settings -> Lists: rename it, hide it,
   * remove it. This only makes sure the thing being filed under exists.
   */
  async accept(resortId: number, list: OptionList, code: string): Promise<void> {
    const trimmed = code.trim();
    if (!trimmed) throw badRequest("Pick or type a category");
    if ((OPTION_LISTS[list].reserved as readonly string[]).includes(trimmed)) return;
    await this.ensureSeeded(resortId, list);
    const existing = await this.find(resortId, list, trimmed);
    if (existing) return;
    await this.prisma.resortOption.create({
      // sorted after whatever the resort was given to start with
      data: { resortId, list, code: trimmed.slice(0, 32), label: trimmed.slice(0, 60), sortOrder: 100 },
    });
  }

  async create(
    claims: JwtClaims,
    resortId: number,
    list: OptionList,
    input: { code: string; label: string; meta?: Record<string, unknown> },
  ) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "settings.manage");
    const code = input.code.trim().toUpperCase();
    if (!OPTION_CODE_RE.test(code)) {
      throw badRequest("code must be 2–32 characters: A–Z, 0–9 or underscore");
    }
    if ((OPTION_LISTS[list].reserved as readonly string[]).includes(code)) {
      throw badRequest(`${code} is written by the system and cannot be a resort's own value`);
    }
    const label = input.label.trim();
    if (!label) throw badRequest("label required");
    await this.ensureSeeded(resortId, list);
    const clash = await this.prisma.resortOption.findUnique({
      where: { resortId_list_code: { resortId, list, code } },
    });
    if (clash) throw badRequest(`${code} is already on this list`);
    const last = await this.prisma.resortOption.findFirst({
      where: { resortId, list },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const row = await this.prisma.resortOption.create({
      data: {
        resortId,
        list,
        code,
        label,
        sortOrder: (last?.sortOrder ?? 0) + 1,
        ...(input.meta ? { meta: input.meta as never } : {}),
      },
    });
    await this.audit.log({
      actorId: claims.userId, resortId, action: "option.create",
      entity: "resortOption", entityId: row.id, diff: { list, code, label },
    });
    return row;
  }

  async update(
    claims: JwtClaims,
    resortId: number,
    id: number,
    input: { label?: string; active?: boolean; sortOrder?: number; meta?: Record<string, unknown> },
  ) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "settings.manage");
    const row = await this.prisma.resortOption.findUnique({ where: { id } });
    if (!row || row.resortId !== resortId) throw notFound("Not found on this resort's lists");
    const data: Record<string, unknown> = {};
    if (input.label !== undefined) {
      const label = input.label.trim();
      if (!label) throw badRequest("label required");
      data.label = label;
    }
    if (input.active !== undefined) data.active = input.active;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.meta !== undefined) data.meta = input.meta;
    const updated = await this.prisma.resortOption.update({ where: { id }, data: data as never });
    await this.audit.log({
      actorId: claims.userId, resortId, action: "option.update",
      entity: "resortOption", entityId: id, diff: { list: row.list, ...data },
    });
    return updated;
  }

  /**
   * Removing a value nothing has used deletes it; one with history is switched
   * off instead. A payment row saying CASH, or a booking saying FACEBOOK, has
   * to keep meaning something a year from now — a report that cannot name what
   * a guest actually paid by is a report with a hole in it.
   */
  async remove(claims: JwtClaims, resortId: number, id: number) {
    requireResortAccess(claims, resortId);
    await this.perms.require(claims, resortId, "settings.manage");
    const row = await this.prisma.resortOption.findUnique({ where: { id } });
    if (!row || row.resortId !== resortId) throw notFound("Not found on this resort's lists");
    const used = await this.usageCount(resortId, row.list as OptionList, row.code);
    if (used > 0) {
      const off = await this.prisma.resortOption.update({ where: { id }, data: { active: false } });
      await this.audit.log({
        actorId: claims.userId, resortId, action: "option.deactivate",
        entity: "resortOption", entityId: id, diff: { list: row.list, code: row.code, used },
      });
      return { removed: false, deactivated: true, used, option: off };
    }
    await this.prisma.resortOption.delete({ where: { id } });
    await this.audit.log({
      actorId: claims.userId, resortId, action: "option.delete",
      entity: "resortOption", entityId: id, diff: { list: row.list, code: row.code },
    });
    return { removed: true, deactivated: false, used: 0 };
  }

  /** How many records already carry this value. Each list knows where it is used. */
  private async usageCount(resortId: number, list: OptionList, code: string): Promise<number> {
    if (list === "PAYMENT_METHOD") {
      const [payments, fb, payroll] = await Promise.all([
        this.prisma.payment.count({ where: { method: code, booking: { resortId } } }),
        this.prisma.fbBill.count({ where: { method: code, resortId } }),
        this.prisma.payrollPayment.count({ where: { method: code, resortId } }),
      ]);
      return payments + fb + payroll;
    }
    if (list === "BOOKING_SOURCE") {
      return this.prisma.booking.count({ where: { resortId, source: code } });
    }
    return this.prisma.activityCatalog.count({ where: { resortId, category: code } });
  }
}
