/**
 * Moved to `@rh/shared` so the mobile app runs the same rules.
 *
 * `monthOf` is aliased: the shared package calls it `shiftMonth`, because
 * `calendar-month.ts` already had a different function called `monthOf` and a
 * package with one front door cannot export both. The console keeps the name
 * it has always used.
 */
export { todayIn, addDaysIso, shiftMonth as monthOf } from "@rh/shared";
