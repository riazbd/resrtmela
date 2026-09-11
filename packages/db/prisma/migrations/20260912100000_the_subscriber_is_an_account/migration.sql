-- The subscriber is an account, not a resort (2026-09-11 design, phase 2).
--
-- `subscriptions.resortId` welded the bill to a building, so a travel agency —
-- which owns no resort — could not hold a subscription, and a chain owner with
-- two resorts could hold two. The subscription and its dues now belong to the
-- tenant (the account); `tenants.plan`, a second answer to "what plan is this
-- customer on", is dropped. Every statement below either creates something that
-- did not exist or rewrites existing rows, so baseline-db classifies the file as
-- one to run.

ALTER TABLE `tenants` ADD COLUMN `kind` VARCHAR(16) NOT NULL DEFAULT 'RESORT_OWNER';
ALTER TABLE `tenants` ADD COLUMN `suspendedReason` VARCHAR(32) NULL;
ALTER TABLE `tenants` ADD COLUMN `suspendedAt` DATETIME(3) NULL;
ALTER TABLE `platform_plans` ADD COLUMN `audience` VARCHAR(16) NOT NULL DEFAULT 'RESORT';

-- subscriptions: resort → account
ALTER TABLE `subscriptions` ADD COLUMN `accountId` INTEGER NULL;
UPDATE `subscriptions` s JOIN `resorts` r ON r.`id` = s.`resortId` SET s.`accountId` = r.`tenantId`;

-- One live subscription per account. A chain owner may hold one live row per
-- resort today; the newest wins (the one PlanLimits already read) and the rest
-- are cancelled rather than deleted, so what an account used to pay stays sayable.
UPDATE `subscriptions` s
LEFT JOIN (
  SELECT `accountId`, MAX(`id`) AS `keep`
  FROM `subscriptions`
  WHERE `status` IN ('TRIAL', 'ACTIVE', 'PAST_DUE')
  GROUP BY `accountId`
) newest ON newest.`accountId` = s.`accountId` AND newest.`keep` = s.`id`
SET s.`status` = 'CANCELLED',
    s.`cancelledAt` = COALESCE(s.`cancelledAt`, CURRENT_TIMESTAMP(3))
WHERE s.`status` IN ('TRIAL', 'ACTIVE', 'PAST_DUE') AND newest.`keep` IS NULL;

ALTER TABLE `subscriptions` MODIFY `accountId` INTEGER NOT NULL;

-- The live-row guard moves to the account. A new name, not `liveKey` again:
-- baseline-db would read a re-created `liveKey` as "already there" and refuse a
-- half-present migration.
ALTER TABLE `subscriptions`
  ADD COLUMN `accountLiveKey` INTEGER
  GENERATED ALWAYS AS (
    CASE WHEN `status` IN ('TRIAL', 'ACTIVE', 'PAST_DUE') THEN `accountId` ELSE NULL END
  ) VIRTUAL;
CREATE UNIQUE INDEX `subscriptions_accountLiveKey_key` ON `subscriptions`(`accountLiveKey`);
CREATE INDEX `subscriptions_accountId_idx` ON `subscriptions`(`accountId`);

ALTER TABLE `subscriptions` DROP INDEX `subscriptions_liveKey_key`;
ALTER TABLE `subscriptions` DROP COLUMN `liveKey`;
ALTER TABLE `subscriptions` DROP FOREIGN KEY `subscriptions_resortId_fkey`;
ALTER TABLE `subscriptions` DROP INDEX `subscriptions_resortId_idx`;
ALTER TABLE `subscriptions` DROP COLUMN `resortId`;
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_accountId_fkey`
  FOREIGN KEY (`accountId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- subscription_dues: follow the subscription they bill
ALTER TABLE `subscription_dues` ADD COLUMN `accountId` INTEGER NULL;
UPDATE `subscription_dues` d JOIN `subscriptions` s ON s.`id` = d.`subscriptionId` SET d.`accountId` = s.`accountId`;
ALTER TABLE `subscription_dues` MODIFY `accountId` INTEGER NOT NULL;
CREATE INDEX `subscription_dues_accountId_idx` ON `subscription_dues`(`accountId`);
ALTER TABLE `subscription_dues` DROP FOREIGN KEY `subscription_dues_resortId_fkey`;
ALTER TABLE `subscription_dues` DROP INDEX `subscription_dues_resortId_idx`;
ALTER TABLE `subscription_dues` DROP COLUMN `resortId`;
ALTER TABLE `subscription_dues` ADD CONSTRAINT `subscription_dues_accountId_fkey`
  FOREIGN KEY (`accountId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `tenants` DROP COLUMN `plan`;
