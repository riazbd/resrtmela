/**
 * Platform policy the super admin owns.
 *
 * Commercial terms — how long the grace period is, how many days late gets a
 * tenant suspended, how much notice they get first — are business decisions,
 * not engineering constants. Baking them into the source means changing a term
 * requires a deploy, and means the person who decides the term cannot see it.
 *
 * Defaults live here so an empty table still behaves sensibly; the moment a
 * row exists it wins. The defaults themselves are chosen for the market this
 * sells into: subscription payments in Bangladesh arrive by bKash or bank
 * transfer with a human in the loop, so a week of grace is normal and cutting
 * someone off on the day is not.
 */
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface BillingPolicy {
  /** days after the due date before the bill is overdue and the subscription past due */
  graceDays: number;
  /** days after the due date before the resort is suspended */
  suspendAfterDays: number;
  /** how much warning before a trial ends or a suspension lands */
  noticeDays: number;
}

export const SETTING_DEFAULTS: Record<string, string> = {
  "billing.graceDays": "7",
  "billing.suspendAfterDays": "15",
  "billing.noticeDays": "3",
  "platform.name": "Resort Mela",
  "platform.supportEmail": "",
  "platform.supportPhone": "",
};

/** Settings are read on every sweep and every branded email; a short cache keeps that free. */
const CACHE_MS = 30_000;

@Injectable()
export class PlatformSettingsService {
  private cache?: { at: number; map: Map<string, string> };

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async load(): Promise<Map<string, string>> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.map;
    const rows = await this.prisma.platformSetting.findMany();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    this.cache = { at: Date.now(), map };
    return map;
  }

  /** Every setting, defaults filled in — the shape the settings screen renders. */
  async all(): Promise<Record<string, string>> {
    const map = await this.load();
    const out: Record<string, string> = { ...SETTING_DEFAULTS };
    for (const [k, v] of map) out[k] = v;
    return out;
  }

  async str(key: string, fallback = ""): Promise<string> {
    const map = await this.load();
    return map.get(key) ?? SETTING_DEFAULTS[key] ?? fallback;
  }

  /** A malformed value falls back rather than throwing: a typo in settings must not stop billing. */
  async num(key: string, fallback: number): Promise<number> {
    const raw = await this.str(key, String(fallback));
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  async billingPolicy(): Promise<BillingPolicy> {
    const [graceDays, suspendAfterDays, noticeDays] = await Promise.all([
      this.num("billing.graceDays", 7),
      this.num("billing.suspendAfterDays", 15),
      this.num("billing.noticeDays", 3),
    ]);
    return { graceDays, suspendAfterDays, noticeDays };
  }

  async set(key: string, value: string): Promise<void> {
    await this.prisma.platformSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    this.cache = undefined;
  }
}
