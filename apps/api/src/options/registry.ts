/**
 * Which lists a resort owns.
 *
 * The *contents* of every list below are the resort's — editable, extendable,
 * no migration and no deploy. This registry is the one part that stays in
 * code, and honestly so: a list exists because some code reads it. Adding a
 * seventh list means writing the code that consumes it, so it is not something
 * an owner can conjure from a settings screen, and pretending otherwise would
 * give them an empty box that does nothing.
 *
 * What each list ships with is *not* here — that is a platform setting
 * (`options.<LIST>.defaults`), so the super admin can change what a new resort
 * starts with, for a market or a moment this code knows nothing about.
 */

export const OPTION_LISTS = {
  /** How a resort takes money. Read by payments, the restaurant and payroll. */
  PAYMENT_METHOD: {
    label: "Payment methods",
    /** codes the system writes itself; never in a resort's list, never pickable */
    reserved: ["WALLET_CREDIT"],
    defaults: [
      { code: "CASH", label: "Cash" },
      { code: "BKASH", label: "bKash" },
      { code: "NAGAD", label: "Nagad" },
      { code: "CARD", label: "Card" },
      { code: "BANK", label: "Bank transfer" },
    ],
  },
  /** Where a booking came from. Read by the source-mix report and the importer. */
  BOOKING_SOURCE: {
    label: "Booking sources",
    reserved: [] as string[],
    defaults: [
      { code: "DIRECT", label: "Direct" },
      { code: "AGENT", label: "Agent" },
      { code: "FACEBOOK", label: "Facebook" },
      { code: "WHATSAPP", label: "WhatsApp" },
      { code: "PHONE", label: "Phone" },
      { code: "APP", label: "App" },
    ],
  },
  /** What kind of thing an activity is. Read by the activities screen. */
  ACTIVITY_CATEGORY: {
    label: "Activity categories",
    reserved: [] as string[],
    defaults: [
      { code: "TOUR", label: "Tour" },
      { code: "WATER_SPORTS", label: "Water sports" },
      { code: "WELLNESS", label: "Wellness" },
      { code: "DINING", label: "Dining" },
      { code: "ENTERTAINMENT", label: "Entertainment" },
      { code: "OTHER", label: "Other" },
    ],
  },

  /**
   * What a resort spends money on. Read by the expenses screen and every
   * report that groups by category.
   *
   * These used to be derived with a `groupBy` over the expense rows, so the
   * list was a memory of whatever anyone had typed: nothing could be added
   * before it was used, nothing renamed, and "Salaries" / "salary" / "Salery"
   * stayed three categories for ever — and three rows in every report.
   */
  EXPENSE_CATEGORY: {
    label: "Expense categories",
    reserved: [] as string[],
    defaults: [
      { code: "SALARY", label: "Salary & wages" },
      { code: "FOOD", label: "Food & kitchen" },
      { code: "UTILITY", label: "Electricity, gas & water" },
      { code: "MAINTENANCE", label: "Repairs & maintenance" },
      { code: "TRANSPORT", label: "Transport & fuel" },
      { code: "SUPPLIES", label: "Housekeeping supplies" },
      { code: "MARKETING", label: "Marketing" },
      { code: "RENT", label: "Rent" },
      { code: "OTHER", label: "Other" },
    ],
  },
} as const;

export type OptionList = keyof typeof OPTION_LISTS;

export const OPTION_LIST_NAMES = Object.keys(OPTION_LISTS) as OptionList[];

export function isOptionList(value: string): value is OptionList {
  return (OPTION_LIST_NAMES as string[]).includes(value);
}

/** The platform-setting key holding what a new resort starts this list with. */
export function defaultsSettingKey(list: OptionList): string {
  return `options.${list}.defaults`;
}

export interface OptionSeed {
  code: string;
  label: string;
  meta?: Record<string, unknown>;
}

const CODE_RE = /^[A-Z0-9_]{2,32}$/;

/**
 * The seed list as configured, or the shipped one when the setting is missing
 * or malformed — the same reasoning as `parseCreditPacks`: a resort that can
 * record no payment at all because someone mistyped a comma is a worse failure
 * than one starting with the defaults.
 */
export function parseOptionSeeds(list: OptionList, raw: string | undefined): OptionSeed[] {
  const fallback = () => OPTION_LISTS[list].defaults as unknown as OptionSeed[];
  if (!raw) return fallback();
  try {
    const parsed = JSON.parse(raw) as OptionSeed[];
    const clean = Array.isArray(parsed)
      ? parsed.filter(
          (m) =>
            m &&
            typeof m.code === "string" &&
            CODE_RE.test(m.code) &&
            typeof m.label === "string" &&
            m.label.trim().length > 0,
        )
      : [];
    return clean.length ? clean : fallback();
  } catch {
    return fallback();
  }
}

export { CODE_RE as OPTION_CODE_RE };
