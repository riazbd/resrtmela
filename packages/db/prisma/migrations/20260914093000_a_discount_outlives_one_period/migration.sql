-- An offer's discount used to be applied once, to `subscriptions.fee`, which
-- then never moved: "20% off" meant twenty percent off for as long as the
-- customer stayed. With prices coming from the plan's ladder, `fee` is re-read
-- every period — so without somewhere to keep it, every existing offer would
-- quietly have become a one-period discount.
ALTER TABLE `subscriptions` ADD COLUMN `discountPct` INTEGER NULL;

-- Nothing is backfilled. A discount that was already baked into `fee` stays
-- baked in for the period it covers, and the accounts that have one are named
-- by their account's `offerId`; guessing a percentage back out of a fee that
-- may also have been hand-set by the super admin would invent history.
