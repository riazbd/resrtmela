-- CreateTable
CREATE TABLE `tenants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `plan` VARCHAR(32) NOT NULL DEFAULT 'free',
    `status` VARCHAR(16) NOT NULL DEFAULT 'active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `tenants_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `resorts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `location` VARCHAR(255) NULL,
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Dhaka',
    `currency` VARCHAR(8) NOT NULL DEFAULT 'BDT',
    `showRatesToAgents` BOOLEAN NOT NULL DEFAULT false,
    `taxRatePct` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    `settings` JSON NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `resorts_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(160) NOT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `email` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(255) NULL,
    `role` ENUM('SUPER_ADMIN', 'RESORT_ADMIN', 'MANAGER', 'FRONT_DESK', 'AGENT', 'HOUSEKEEPING', 'GUEST') NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_phone_key`(`phone`),
    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_resorts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `resortId` INTEGER NOT NULL,
    `commissionRate` DECIMAL(5, 2) NULL,

    UNIQUE INDEX `user_resorts_userId_resortId_key`(`userId`, `resortId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `room_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `resortId` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `maxAdults` INTEGER NOT NULL DEFAULT 2,
    `maxChildren` INTEGER NOT NULL DEFAULT 0,
    `amenities` JSON NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `room_types_resortId_idx`(`resortId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rooms` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `resortId` INTEGER NOT NULL,
    `roomTypeId` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `baseRate` DECIMAL(10, 2) NOT NULL,
    `status` ENUM('ACTIVE', 'OUT_OF_SERVICE') NOT NULL DEFAULT 'ACTIVE',

    INDEX `rooms_resortId_idx`(`resortId`),
    UNIQUE INDEX `rooms_resortId_name_key`(`resortId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rate_plans` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `resortId` INTEGER NOT NULL,
    `roomTypeId` INTEGER NOT NULL,
    `dateFrom` DATE NOT NULL,
    `dateTo` DATE NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `rate_plans_roomTypeId_dateFrom_dateTo_idx`(`roomTypeId`, `dateFrom`, `dateTo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `guests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `resortId` INTEGER NULL,
    `fullName` VARCHAR(160) NOT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `nidPassportNo` VARCHAR(64) NULL,
    `phoneKey` CHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `isGuestUser` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `guests_phoneKey_key`(`phoneKey`),
    INDEX `guests_phoneKey_idx`(`phoneKey`),
    INDEX `guests_resortId_idx`(`resortId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bookings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(12) NOT NULL,
    `resortId` INTEGER NOT NULL,
    `kind` ENUM('ROOM', 'ACTIVITY', 'PACKAGE') NOT NULL DEFAULT 'ROOM',
    `guestId` INTEGER NOT NULL,
    `createdById` INTEGER NULL,
    `agentUserId` INTEGER NULL,
    `source` ENUM('DIRECT', 'AGENT', 'FACEBOOK', 'WHATSAPP', 'PHONE', 'APP') NOT NULL DEFAULT 'DIRECT',
    `checkIn` DATE NULL,
    `checkOut` DATE NULL,
    `adults` INTEGER NOT NULL DEFAULT 2,
    `children` INTEGER NOT NULL DEFAULT 0,
    `discount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `remarks` TEXT NULL,
    `state` ENUM('PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW') NOT NULL DEFAULT 'PENDING',
    `cancelState` ENUM('NONE', 'REQUESTED', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'NONE',
    `paymentState` ENUM('UNPAID', 'PARTIAL', 'PAID') NOT NULL DEFAULT 'UNPAID',
    `bookedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `bookings_resortId_checkIn_checkOut_idx`(`resortId`, `checkIn`, `checkOut`),
    INDEX `bookings_guestId_idx`(`guestId`),
    INDEX `bookings_agentUserId_idx`(`agentUserId`),
    INDEX `bookings_state_paymentState_idx`(`state`, `paymentState`),
    UNIQUE INDEX `bookings_resortId_code_key`(`resortId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bookingId` INTEGER NOT NULL,
    `itemKind` ENUM('ROOM', 'ACTIVITY') NOT NULL DEFAULT 'ROOM',
    `roomId` INTEGER NULL,
    `activitySlotId` INTEGER NULL,
    `qty` INTEGER NOT NULL DEFAULT 1,
    `unitPrice` DECIMAL(10, 2) NOT NULL,

    INDEX `booking_items_bookingId_idx`(`bookingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_nights` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `itemId` INTEGER NOT NULL,
    `roomId` INTEGER NOT NULL,
    `night` DATE NOT NULL,

    INDEX `booking_nights_night_idx`(`night`),
    UNIQUE INDEX `booking_nights_roomId_night_key`(`roomId`, `night`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_catalog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `resortId` INTEGER NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `category` ENUM('TOUR', 'WATER_SPORTS', 'WELLNESS', 'DINING', 'ENTERTAINMENT', 'OTHER') NOT NULL DEFAULT 'TOUR',
    `basePrice` DECIMAL(10, 2) NOT NULL,
    `durationMin` INTEGER NOT NULL DEFAULT 60,
    `minPerSlot` INTEGER NOT NULL DEFAULT 1,
    `maxPerSlot` INTEGER NOT NULL DEFAULT 10,
    `description` TEXT NULL,
    `photos` JSON NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `activity_catalog_resortId_idx`(`resortId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_slots` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `catalogId` INTEGER NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `capacity` INTEGER NOT NULL DEFAULT 10,
    `bookedCount` INTEGER NOT NULL DEFAULT 0,

    INDEX `activity_slots_startsAt_idx`(`startsAt`),
    UNIQUE INDEX `activity_slots_catalogId_startsAt_key`(`catalogId`, `startsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bookingId` INTEGER NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `method` ENUM('CASH', 'BKASH', 'NAGAD', 'CARD', 'BANK', 'WALLET_CREDIT') NOT NULL DEFAULT 'CASH',
    `paymentType` ENUM('ADVANCE', 'FINAL', 'REFUND') NOT NULL DEFAULT 'ADVANCE',
    `receivedById` INTEGER NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `note` VARCHAR(255) NULL,

    INDEX `payments_bookingId_idx`(`bookingId`),
    INDEX `payments_receivedAt_idx`(`receivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_log` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `actorId` INTEGER NULL,
    `resortId` INTEGER NULL,
    `action` VARCHAR(64) NOT NULL,
    `entity` VARCHAR(32) NOT NULL,
    `entityId` BIGINT NULL,
    `diff` JSON NULL,
    `ip` VARBINARY(16) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_log_entity_entityId_idx`(`entity`, `entityId`),
    INDEX `audit_log_createdAt_idx`(`createdAt`),
    INDEX `audit_log_actorId_idx`(`actorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_jobs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `channel` ENUM('SMS', 'WHATSAPP', 'PUSH', 'EMAIL') NOT NULL,
    `toRef` VARCHAR(64) NOT NULL,
    `template` VARCHAR(64) NOT NULL,
    `payload` JSON NULL,
    `sendAfter` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sentAt` DATETIME(3) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastError` TEXT NULL,

    INDEX `notification_jobs_sendAfter_sentAt_idx`(`sendAfter`, `sentAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `counters` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `resortId` INTEGER NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `nextVal` INTEGER NOT NULL DEFAULT 1,

    UNIQUE INDEX `counters_resortId_kind_key`(`resortId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `resorts` ADD CONSTRAINT `resorts_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_resorts` ADD CONSTRAINT `user_resorts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_resorts` ADD CONSTRAINT `user_resorts_resortId_fkey` FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_types` ADD CONSTRAINT `room_types_resortId_fkey` FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rooms` ADD CONSTRAINT `rooms_resortId_fkey` FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rooms` ADD CONSTRAINT `rooms_roomTypeId_fkey` FOREIGN KEY (`roomTypeId`) REFERENCES `room_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rate_plans` ADD CONSTRAINT `rate_plans_resortId_fkey` FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rate_plans` ADD CONSTRAINT `rate_plans_roomTypeId_fkey` FOREIGN KEY (`roomTypeId`) REFERENCES `room_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guests` ADD CONSTRAINT `guests_resortId_fkey` FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_resortId_fkey` FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_guestId_fkey` FOREIGN KEY (`guestId`) REFERENCES `guests`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_agentUserId_fkey` FOREIGN KEY (`agentUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_items` ADD CONSTRAINT `booking_items_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_items` ADD CONSTRAINT `booking_items_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `rooms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_items` ADD CONSTRAINT `booking_items_activitySlotId_fkey` FOREIGN KEY (`activitySlotId`) REFERENCES `activity_slots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_nights` ADD CONSTRAINT `booking_nights_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `booking_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_nights` ADD CONSTRAINT `booking_nights_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `rooms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_catalog` ADD CONSTRAINT `activity_catalog_resortId_fkey` FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_slots` ADD CONSTRAINT `activity_slots_catalogId_fkey` FOREIGN KEY (`catalogId`) REFERENCES `activity_catalog`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_receivedById_fkey` FOREIGN KEY (`receivedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_resortId_fkey` FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `counters` ADD CONSTRAINT `counters_resortId_fkey` FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
