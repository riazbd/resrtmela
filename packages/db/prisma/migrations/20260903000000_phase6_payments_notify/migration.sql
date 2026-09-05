CREATE TABLE `payment_intents` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `resortId` INTEGER NOT NULL,
  `bookingId` INTEGER NOT NULL,
  `provider` VARCHAR(24) NOT NULL,
  `providerRef` VARCHAR(64) NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `method` ENUM('CASH','BKASH','NAGAD','CARD','BANK','WALLET_CREDIT') NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
  `trxId` VARCHAR(64) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `paidAt` DATETIME(3) NULL,
  UNIQUE INDEX `payment_intents_providerRef_key`(`providerRef`),
  INDEX `payment_intents_bookingId_idx`(`bookingId`),
  INDEX `payment_intents_status_idx`(`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

ALTER TABLE `payment_intents` ADD CONSTRAINT `payment_intents_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `notification_jobs` ADD COLUMN `dedupeKey` VARCHAR(191) NULL, ADD UNIQUE INDEX `notification_jobs_dedupeKey_key`(`dedupeKey`);
