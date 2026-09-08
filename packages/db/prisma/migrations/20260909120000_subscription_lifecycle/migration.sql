-- Subscription lifecycle.
--
-- resorts.suspendedReason records WHO suspended a resort. Without it the
-- billing sweep, on seeing a paid account, would lift a suspension a human
-- imposed for fraud or abuse.
--
-- The unique index on (subscriptionId, periodStart) is what makes the sweep
-- safe to run every hour: a second pass over the same billing period cannot
-- raise a second invoice, no matter what the application code does.
--
-- platform_settings holds policy the super admin owns -- grace days, notice
-- windows -- so changing a commercial term is an edit, not a deploy.

-- AlterTable
ALTER TABLE `resorts` ADD COLUMN `suspendedAt` DATETIME(3) NULL,
    ADD COLUMN `suspendedReason` VARCHAR(32) NULL;

-- CreateTable
CREATE TABLE `platform_settings` (
    `key` VARCHAR(64) NOT NULL,
    `value` VARCHAR(255) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `subscription_dues_subscriptionId_periodStart_key` ON `subscription_dues`(`subscriptionId`, `periodStart`);

