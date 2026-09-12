-- A plan can be sold by the year, and a subscription knows which rhythm it is on.
--
-- Every subscription billing system in the world models this the same way: one
-- product carrying the limits and the features, and a price per interval hung
-- off it. The alternative — a second "Starter Yearly" plan row — forks the
-- limits, the feature ticks and every report that groups by plan, and then the
-- two copies drift.

-- NULL means this plan is not sold by the year. Every plan starts that way;
-- the owner sets a yearly price on the ones they want to offer annually.
ALTER TABLE `platform_plans`
  ADD COLUMN `yearlyFee` DECIMAL(10, 2) NULL AFTER `monthlyFee`;

-- `monthlyFee` held what the account pays each period, which was a month's fee
-- and only ever a month's fee. It is about to hold a year's on some rows, so
-- the name has to stop saying "monthly" — this codebase has a scar from a
-- number read under the wrong name. The plan's own `monthlyFee` keeps its name
-- because it really is the monthly price.
ALTER TABLE `subscriptions`
  CHANGE COLUMN `monthlyFee` `fee` DECIMAL(10, 2) NOT NULL;

-- MONTHLY | YEARLY. Everything already sold was sold by the month, which is
-- exactly what the default says, so no existing row changes meaning.
--
-- `billingCycle` rather than `interval`: INTERVAL is a reserved word in MySQL
-- and MariaDB, and a column that needs backticks in every hand-written query
-- is a trap left for later.
ALTER TABLE `subscriptions`
  ADD COLUMN `billingCycle` VARCHAR(8) NOT NULL DEFAULT 'MONTHLY' AFTER `status`,
  ADD COLUMN `pendingCycle` VARCHAR(8) NULL AFTER `pendingPlan`;
