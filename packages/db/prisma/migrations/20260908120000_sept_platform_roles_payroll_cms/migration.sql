-- Catch-up migration: brings migration history in line with schema.prisma.
--
-- Everything added after 2026-09-03 (platform/SaaS layer, roles & permissions,
-- payroll, food packages, CMS) had been applied with `prisma db push`, so no
-- migration file existed and a fresh database could not be provisioned from
-- this repo at all.
--
-- Two statements `prisma migrate diff` emitted were dropped by hand:
--   * DROP FOREIGN KEY bookings_resortId_fkey  — never re-added, and the
--     constraint does not change (RESTRICT in both init and schema). The
--     bookings_resortId_code unique index keeps it supported after the
--     bookings_resortId_invoiceNo index is dropped.
--   * ADD CONSTRAINT guests_resortId_fkey      — byte-identical to the
--     constraint init already created, so re-adding it fails as a duplicate.


-- DropIndex
DROP INDEX `bookings_resortId_invoiceNo_idx` ON `bookings`;

-- AlterTable
ALTER TABLE `booking_items` MODIFY `itemKind` ENUM('ROOM', 'ACTIVITY', 'FB', 'EXTRA_PERSON') NOT NULL DEFAULT 'ROOM';

-- AlterTable
ALTER TABLE `bookings` ADD COLUMN `extraPersons` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `invoiceAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `expenses` ADD COLUMN `scope` VARCHAR(10) NOT NULL DEFAULT 'RESORT';

-- AlterTable
ALTER TABLE `resorts` ADD COLUMN `agentPaymentHours` INTEGER NOT NULL DEFAULT 48;

-- AlterTable
ALTER TABLE `room_types` ADD COLUMN `extraPersonAllowed` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `extraPersonRate` DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `user_resorts` ADD COLUMN `commissionKind` VARCHAR(8) NOT NULL DEFAULT 'PERCENT',
    ADD COLUMN `roleId` INTEGER NULL,
    MODIFY `commissionRate` DECIMAL(10, 2) NULL;

-- AlterTable
ALTER TABLE `users` MODIFY `phone` VARCHAR(32) NULL;

-- CreateTable
CREATE TABLE `roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `resortId` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `permissions` JSON NOT NULL,
    `system` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `roles_resortId_name_key`(`resortId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employees` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `resortId` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `designation` VARCHAR(80) NULL,
    `salary` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `joinDate` DATE NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `employees_resortId_idx`(`resortId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payroll_payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `resortId` INTEGER NOT NULL,
    `employeeId` INTEGER NOT NULL,
    `month` VARCHAR(7) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `method` ENUM('CASH', 'BKASH', 'NAGAD', 'CARD', 'BANK', 'WALLET_CREDIT') NULL,
    `note` VARCHAR(255) NULL,
    `paidAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdById` INTEGER NULL,

    INDEX `payroll_payments_resortId_month_idx`(`resortId`, `month`),
    UNIQUE INDEX `payroll_payments_employeeId_month_key`(`employeeId`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `food_packages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `resortId` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `items` VARCHAR(500) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `food_packages_resortId_idx`(`resortId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cms_settings` (
    `key` VARCHAR(60) NOT NULL,
    `value` TEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscriptions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `resortId` INTEGER NOT NULL,
    `plan` ENUM('STARTER', 'GROWTH', 'CHAIN') NOT NULL DEFAULT 'STARTER',
    `status` VARCHAR(16) NOT NULL DEFAULT 'TRIAL',
    `monthlyFee` DECIMAL(10, 2) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `trialEndsAt` DATETIME(3) NULL,
    `renewsAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `note` VARCHAR(255) NULL,

    INDEX `subscriptions_resortId_idx`(`resortId`),
    INDEX `subscriptions_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscription_dues` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `subscriptionId` BIGINT NOT NULL,
    `resortId` INTEGER NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `periodStart` DATETIME(3) NOT NULL,
    `periodEnd` DATETIME(3) NOT NULL,
    `dueDate` DATETIME(3) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DUE',
    `paidAt` DATETIME(3) NULL,
    `note` VARCHAR(255) NULL,

    INDEX `subscription_dues_status_idx`(`status`),
    INDEX `subscription_dues_resortId_idx`(`resortId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `balance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `wallets_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallet_txns` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `walletId` INTEGER NOT NULL,
    `kind` ENUM('TOPUP', 'COMMISSION', 'BOOKING_HOLD', 'PAYOUT', 'REFUND', 'ADJUST') NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `balanceAfter` DECIMAL(12, 2) NOT NULL,
    `bookingId` INTEGER NULL,
    `note` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `wallet_txns_walletId_idx`(`walletId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `api_keys` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `resortId` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `prefix` VARCHAR(24) NOT NULL,
    `keyHash` VARCHAR(128) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `lastUsedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `api_keys_prefix_key`(`prefix`),
    INDEX `api_keys_resortId_idx`(`resortId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `discount_offers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `resortId` INTEGER NOT NULL,
    `scope` VARCHAR(8) NOT NULL DEFAULT 'RESORT',
    `roomTypeId` INTEGER NULL,
    `name` VARCHAR(120) NOT NULL,
    `kind` VARCHAR(8) NOT NULL DEFAULT 'PERCENT',
    `value` DECIMAL(10, 2) NOT NULL,
    `validFrom` DATETIME(3) NULL,
    `validTo` DATETIME(3) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `discount_offers_resortId_idx`(`resortId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `resortId` INTEGER NULL,
    `title` VARCHAR(160) NOT NULL,
    `body` VARCHAR(500) NULL,
    `kind` VARCHAR(16) NOT NULL DEFAULT 'info',
    `link` VARCHAR(160) NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_userId_readAt_idx`(`userId`, `readAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `resort_access` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `resortId` INTEGER NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `note` VARCHAR(255) NULL,
    `decidedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `resort_access_userId_resortId_key`(`userId`, `resortId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_credits` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `credits` INTEGER NOT NULL DEFAULT 0,
    `purchasedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `email_credits_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_campaigns` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `resortId` INTEGER NULL,
    `subject` VARCHAR(200) NOT NULL,
    `body` TEXT NOT NULL,
    `recipients` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'SENT',
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `email_campaigns_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_plans` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(16) NOT NULL,
    `label` VARCHAR(40) NOT NULL,
    `monthlyFee` DECIMAL(10, 2) NOT NULL,
    `maxRooms` INTEGER NOT NULL DEFAULT 10,
    `maxResorts` INTEGER NOT NULL DEFAULT 1,
    `blurb` VARCHAR(200) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `platform_plans_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_resorts` ADD CONSTRAINT `user_resorts_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `roles` ADD CONSTRAINT `roles_resortId_fkey` FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_resortId_fkey` FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payroll_payments` ADD CONSTRAINT `payroll_payments_resortId_fkey` FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payroll_payments` ADD CONSTRAINT `payroll_payments_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `food_packages` ADD CONSTRAINT `food_packages_resortId_fkey` FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_resortId_fkey` FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscription_dues` ADD CONSTRAINT `subscription_dues_subscriptionId_fkey` FOREIGN KEY (`subscriptionId`) REFERENCES `subscriptions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscription_dues` ADD CONSTRAINT `subscription_dues_resortId_fkey` FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallets` ADD CONSTRAINT `wallets_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet_txns` ADD CONSTRAINT `wallet_txns_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `wallets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `api_keys` ADD CONSTRAINT `api_keys_resortId_fkey` FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discount_offers` ADD CONSTRAINT `discount_offers_resortId_fkey` FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discount_offers` ADD CONSTRAINT `discount_offers_roomTypeId_fkey` FOREIGN KEY (`roomTypeId`) REFERENCES `room_types`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `resort_access` ADD CONSTRAINT `resort_access_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `resort_access` ADD CONSTRAINT `resort_access_resortId_fkey` FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_credits` ADD CONSTRAINT `email_credits_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_campaigns` ADD CONSTRAINT `email_campaigns_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

