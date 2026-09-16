-- Services, damage and fines, as lines on the stay they belong to.
ALTER TABLE `booking_items` MODIFY `itemKind` ENUM('ROOM', 'ACTIVITY', 'FB', 'EXTRA_PERSON', 'CHARGE') NOT NULL DEFAULT 'ROOM';
ALTER TABLE `booking_items` ADD COLUMN `chargeKind` VARCHAR(12) NULL;
ALTER TABLE `booking_items` ADD COLUMN `label` VARCHAR(160) NULL;
