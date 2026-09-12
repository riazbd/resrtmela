-- A charge is billed to a customer, not to a resort.
--
-- `SubscriptionDue.accountId` is documented as "the customer billed — a resort
-- owner or an agency, not a resort", which is why an agency can hold a
-- subscription. `platform_charges` and `email_credit_orders` were keyed to a
-- resort instead, so an agency — which has none — could not be charged for
-- anything. Bulk Email is offered to agencies and spends credits, so the effect
-- was a screen that said "buy a pack first" beside a purchase that refused
-- them: a closed loop with no way out.
--
-- Which resort asked is still worth keeping for an owner with several, so it
-- stays as nullable context rather than being dropped. ON DELETE SET NULL, not
-- CASCADE: deleting a resort must not delete a bill the owner still owes.

-- ── platform_charges ─────────────────────────────────────────────────────
ALTER TABLE `platform_charges` ADD COLUMN `accountId` INT NULL AFTER `id`;

-- every existing charge belongs to the owner of the resort it was raised on
UPDATE `platform_charges` c
  JOIN `resorts` r ON r.`id` = c.`resortId`
  SET c.`accountId` = r.`tenantId`;

-- a charge with no customer cannot be billed to anyone; there must be none
-- left before the column is closed
ALTER TABLE `platform_charges` MODIFY COLUMN `accountId` INT NOT NULL;

ALTER TABLE `platform_charges` DROP FOREIGN KEY `platform_charges_resortId_fkey`;
DROP INDEX `platform_charges_resortId_clientRef_key` ON `platform_charges`;
DROP INDEX `platform_charges_resortId_status_idx` ON `platform_charges`;

ALTER TABLE `platform_charges` MODIFY COLUMN `resortId` INT NULL;

ALTER TABLE `platform_charges`
  ADD CONSTRAINT `platform_charges_accountId_fkey`
  FOREIGN KEY (`accountId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `platform_charges`
  ADD CONSTRAINT `platform_charges_resortId_fkey`
  FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX `platform_charges_accountId_clientRef_key` ON `platform_charges`(`accountId`, `clientRef`);
CREATE INDEX `platform_charges_accountId_status_idx` ON `platform_charges`(`accountId`, `status`);
CREATE INDEX `platform_charges_resortId_idx` ON `platform_charges`(`resortId`);

-- ── email_credit_orders ──────────────────────────────────────────────────
ALTER TABLE `email_credit_orders` ADD COLUMN `accountId` INT NULL AFTER `userId`;

UPDATE `email_credit_orders` o
  JOIN `resorts` r ON r.`id` = o.`resortId`
  SET o.`accountId` = r.`tenantId`;

ALTER TABLE `email_credit_orders` MODIFY COLUMN `accountId` INT NOT NULL;

ALTER TABLE `email_credit_orders` DROP FOREIGN KEY `email_credit_orders_resortId_fkey`;
DROP INDEX `email_credit_orders_resortId_clientRef_key` ON `email_credit_orders`;

ALTER TABLE `email_credit_orders` MODIFY COLUMN `resortId` INT NULL;

ALTER TABLE `email_credit_orders`
  ADD CONSTRAINT `email_credit_orders_accountId_fkey`
  FOREIGN KEY (`accountId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `email_credit_orders`
  ADD CONSTRAINT `email_credit_orders_resortId_fkey`
  FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX `email_credit_orders_accountId_clientRef_key` ON `email_credit_orders`(`accountId`, `clientRef`);
CREATE INDEX `email_credit_orders_resortId_idx` ON `email_credit_orders`(`resortId`);
