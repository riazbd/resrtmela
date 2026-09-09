-- A downgrade the resort has asked for, held until the month it has paid for ends.
--
-- Upgrades are immediate and billed pro rata, so they need no column. A
-- downgrade does: taking the dearer plan away mid-period would be taking back
-- something already invoiced, so the request is parked here and the billing
-- sweep applies it at the renewal.
ALTER TABLE `subscriptions` ADD COLUMN `pendingPlan` VARCHAR(16) NULL;
