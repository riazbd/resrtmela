ALTER TABLE `booking_items` MODIFY COLUMN `itemKind` ENUM('ROOM','ACTIVITY','FB') NOT NULL DEFAULT 'ROOM';

ALTER TABLE `booking_items` ADD COLUMN `fbBillId` INTEGER NULL,
  ADD INDEX `booking_items_fbBillId_idx`(`fbBillId`),
  ADD CONSTRAINT `booking_items_fbBillId_fkey` FOREIGN KEY (`fbBillId`) REFERENCES `fb_bills`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
