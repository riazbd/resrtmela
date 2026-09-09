/**
 * Signup-wizard helpers.
 *
 * The plan table that used to live here is gone: FREE / STANDARD / PRO were a
 * second vocabulary competing with the `platform_plans` rows the super admin
 * edits, and only one of them could be right. They are rows now — see migration
 * 20260909250000_one_plan_vocabulary — and PlanLimitsService reads the table.
 */

export function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
