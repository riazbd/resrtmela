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
import { OPTION_LISTS, OPTION_LIST_NAMES, defaultsSettingKey } from "../options/registry";

export interface BillingPolicy {
  /** days after the due date before the bill is overdue and the subscription past due */
  graceDays: number;
  /** days after the due date before the resort is suspended */
  suspendAfterDays: number;
  /** how much warning before a trial ends or a suspension lands */
  noticeDays: number;
}

/**
 * What a new resort starts each of its own lists with.
 *
 * Not constants and not Prisma enums: which payment rails exist, and which
 * channels a resort sells through, are facts about a market — this platform
 * sells into one where bKash and Nagad matter and a platform selling elsewhere
 * would want neither. The super admin edits these; each resort then owns its
 * copy and can add anything without a migration.
 */
function listDefaults(): Record<string, string> {
  return Object.fromEntries(
    OPTION_LIST_NAMES.map((name) => [
      defaultsSettingKey(name),
      JSON.stringify(OPTION_LISTS[name].defaults),
    ]),
  );
}

export const SETTING_DEFAULTS: Record<string, string> = {
  ...listDefaults(),
  "billing.graceDays": "7",
  "billing.suspendAfterDays": "15",
  "billing.noticeDays": "3",
  "platform.name": "Resort Mela",
  "platform.supportEmail": "",
  "platform.supportPhone": "",
  /**
   * What an email credit pack costs. Commercial terms, so the super admin owns
   * them: these were compiled into the console *and* the request validator
   * *and* the service, which meant the platform could not change what it sells
   * without a deploy, and the three copies could disagree in the meantime.
   */
  "email.creditPacks": JSON.stringify([
    { credits: 500, price: 500 },
    { credits: 2000, price: 1800 },
    { credits: 10000, price: 7500 },
  ]),
};

export interface CreditPack {
  credits: number;
  price: number;
}

/**
 * The packs as configured, or the shipped list when the setting is missing or
 * malformed. A platform that sells nothing because someone mistyped a JSON
 * comma is a worse failure than one selling last month's prices.
 */
export function parseCreditPacks(raw: string | undefined): CreditPack[] {
  const fallback = () => JSON.parse(SETTING_DEFAULTS["email.creditPacks"]!) as CreditPack[];
  if (!raw) return fallback();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return fallback();
    const packs = parsed
      .filter((p): p is CreditPack => {
        const row = p as CreditPack;
        return row != null && Number(row.credits) > 0 && Number(row.price) >= 0;
      })
      .map((p) => ({ credits: Number(p.credits), price: Number(p.price) }));
    return packs.length > 0 ? packs : fallback();
  } catch {
    return fallback();
  }
}

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
