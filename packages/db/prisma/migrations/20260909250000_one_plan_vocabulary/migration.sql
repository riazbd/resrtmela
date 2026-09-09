-- One plan vocabulary.
--
-- The code held FREE / STANDARD / PRO with limits of 10 / 50 / 500 rooms; this
-- table held STARTER / GROWTH / CHAIN with 10 / 40 / 10,000. Two lists, no
-- relationship, and PlanLimitsService silently choosing between them. Signup
-- put every new tenant on "FREE" -- a name that did not exist here at all.
--
-- Both lists become rows. The plans on sale keep selling; the legacy names
-- arrive inactive, carrying exactly the numbers the constant gave them, so no
-- existing tenant's capacity moves by a single room today. Mapping the old
-- names onto the nearest new plan would have quietly taken ten rooms off every
-- STANDARD tenant, which is why it was not done.

-- The plans on sale. INSERT IGNORE, because a platform that has been running
-- already has these and the super admin may have edited them since.
INSERT IGNORE INTO `platform_plans`
  (`name`, `label`, `monthlyFee`, `maxRooms`, `maxResorts`, `trialDays`, `blurb`, `active`, `sortOrder`)
VALUES
  ('STARTER', 'Starter', 2500,  10,    1,  14, 'For small resorts getting off spreadsheets', 1, 1),
  ('GROWTH',  'Growth',  5000,  40,    2,  14, 'For busy resorts with restaurant & agents',  1, 2),
  ('CHAIN',   'Chain',   12000, 10000, 10, 14, 'For multi-resort owners',                    1, 3);

-- The names tenants already carry, with the limits they already had. Inactive:
-- they resolve limits for existing tenants but are never offered for sale.
INSERT IGNORE INTO `platform_plans`
  (`name`, `label`, `monthlyFee`, `maxRooms`, `maxResorts`, `trialDays`, `blurb`, `active`, `sortOrder`)
VALUES
  ('FREE',     'Free (legacy)',     0, 10,  1,  14, 'Retired: kept so existing tenants keep their limits', 0, 90),
  ('STANDARD', 'Standard (legacy)', 0, 50,  3,  14, 'Retired: kept so existing tenants keep their limits', 0, 91),
  ('PRO',      'Pro (legacy)',      0, 500, 10, 14, 'Retired: kept so existing tenants keep their limits', 0, 92);

-- Casing drifted: "free" and "STANDARD" both exist in the wild, and a lookup by
-- name has to match one of them.
UPDATE `tenants` SET `plan` = UPPER(`plan`) WHERE `plan` IS NOT NULL;
