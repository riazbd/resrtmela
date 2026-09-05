-- Phase 8: expenses, F&B bills, invoices, resort settings

ALTER TABLE `resorts` ADD COLUMN `invoicePrefix` VARCHAR(12) NOT NULL DEFAULT 'SER',
  ADD COLUMN `checkInTime` VARCHAR(16) NOT NULL DEFAULT '12:00 PM',
  ADD COLUMN `checkOutTime` VARCHAR(16) NOT NULL DEFAULT '10:00 AM',
  ADD COLUMN `address` VARCHAR(255) NULL,
  ADD COLUMN `website` VARCHAR(160) NULL,
  ADD COLUMN `contactPhone` VARCHAR(32) NULL;

ALTER TABLE `bookings` ADD COLUMN `invoiceNo` VARCHAR(20) NULL,
  ADD INDEX `bookings_resortId_invoiceNo_idx`(`resortId`, `invoiceNo`);

CREATE TABLE `expenses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `resortId` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `category` VARCHAR(120) NOT NULL,
    `details` VARCHAR(255) NULL,
    `amount` DECIMAL(10,2) NOT NULL,
    `createdBy` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `expenses_resortId_date_idx`(`resortId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

ALTER TABLE `expenses` ADD CONSTRAINT `expenses_resortId_fkey` FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `fb_bills` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `resortId` INTEGER NOT NULL,
    `code` VARCHAR(16) NOT NULL,
    `billDate` DATE NOT NULL,
    `guestName` VARCHAR(160) NULL,
    `bookingId` INTEGER NULL,
    `roomId` INTEGER NULL,
    `paidAmount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `method` ENUM('CASH','BKASH','NAGAD','CARD','BANK','WALLET_CREDIT') NULL,
    `note` VARCHAR(255) NULL,
    `createdBy` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,
    UNIQUE INDEX `fb_bills_resortId_code_key`(`resortId`, `code`),
    INDEX `fb_bills_resortId_billDate_idx`(`resortId`, `billDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

ALTER TABLE `fb_bills` ADD CONSTRAINT `fb_bills_resortId_fkey` FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `fb_bills` ADD CONSTRAINT `fb_bills_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `fb_bills` ADD CONSTRAINT `fb_bills_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `rooms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `fb_bill_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `billId` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `qty` INTEGER NOT NULL DEFAULT 1,
    `unitPrice` DECIMAL(10,2) NOT NULL,
    INDEX `fb_bill_items_billId_idx`(`billId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

ALTER TABLE `fb_bill_items` ADD CONSTRAINT `fb_bill_items_billId_fkey` FOREIGN KEY (`billId`) REFERENCES `fb_bills`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
