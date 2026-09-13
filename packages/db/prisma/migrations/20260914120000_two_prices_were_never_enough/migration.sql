-- The four columns that could only ever describe two ways of selling a thing.
--
-- `platform_plans.monthlyFee` and `yearlyFee` were the platform's whole
-- pricing vocabulary; `subscriptions.billingCycle` and `pendingCycle` were the
-- customer's half of the same limit. Prices live in `plan_schedules` ->
-- `plan_phases` now, written by the owner, as many shelves and as many rungs
-- as they like.
--
-- Safe to drop only because migration 20260914090000 copied every price into a
-- schedule and pointed every live subscription at one, and because the last
-- readers were removed in the same change as this file. Nothing here loses a
-- price: the values are in `plan_phases`, and every account's own fee has
-- always lived on its own row in `subscriptions.fee`.

ALTER TABLE `platform_plans`
    DROP COLUMN `monthlyFee`,
    DROP COLUMN `yearlyFee`;

ALTER TABLE `subscriptions`
    DROP COLUMN `billingCycle`,
    DROP COLUMN `pendingCycle`;
