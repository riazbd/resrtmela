-- A plan says what is in it, and the API can read the answer.
--
-- The ticks on the pricing cards were a hardcoded map in the homepage, keyed by
-- plan name. Two things followed. A plan the owner created showed no features
-- at all, because the map had no entry for it. And no line on any card locked
-- anything: a Starter customer whose card never mentioned the restaurant could
-- open the restaurant and use it all month.
--
-- `features` is the same shape as `roles.permissions` — a JSON array of keys
-- from a vocabulary declared in code (PLAN_FEATURES in @rh/shared), validated
-- on the way in. `maxStaff` is the "1 staff account" / "5 staff accounts" line,
-- which was print on a card and nothing else.
--
-- Added nullable and tightened at the end: a JSON column cannot carry a literal
-- DEFAULT on MySQL, so `ADD COLUMN ... JSON NOT NULL` on a table with rows in
-- it means an implicit empty string, which is not valid JSON and fails outright
-- under strict mode.

ALTER TABLE `platform_plans`
  ADD COLUMN `maxStaff` INT NOT NULL DEFAULT 1,
  ADD COLUMN `features` JSON NULL;

-- Seeded to exactly what the homepage has been publishing, so nobody's pricing
-- page changes the day this lands. The plain-English lines that gate nothing
-- ("Booking calendar & front desk", "Guest database", "Priority support") are
-- not features and have no key: the console has always shown a calendar and a
-- guest list to everyone, and a promise about support is not a lock.
UPDATE `platform_plans`
SET `features` = JSON_ARRAY(), `maxStaff` = 1
WHERE `name` = 'STARTER';

UPDATE `platform_plans`
SET `features` = JSON_ARRAY('restaurant', 'agents', 'discounts', 'activities'), `maxStaff` = 5
WHERE `name` = 'GROWTH';

-- Everything, which is what "Everything in Growth" plus the API line meant.
UPDATE `platform_plans`
SET `features` = JSON_ARRAY('restaurant', 'agents', 'discounts', 'activities', 'public_api', 'bulk_email', 'payroll', 'imports'),
    `maxStaff` = 50
WHERE `name` = 'CHAIN';

-- Every other row — the retired names existing tenants still carry, and any
-- plan the owner has already created — gets everything.
--
-- The retired names exist so a tenant who was on FREE keeps the limits they
-- had (migration 20260909250000_one_plan_vocabulary). Taking modules away from
-- them here would be exactly the cost that migration was written to avoid, and
-- a lock arriving inside a migration must never be the first a paying customer
-- hears of it. Unticking is one click in Platform → Plans.
UPDATE `platform_plans`
SET `features` = JSON_ARRAY('restaurant', 'agents', 'discounts', 'activities', 'public_api', 'bulk_email', 'payroll', 'imports'),
    `maxStaff` = 50
WHERE `features` IS NULL;

ALTER TABLE `platform_plans` MODIFY COLUMN `features` JSON NOT NULL;
