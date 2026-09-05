ALTER TABLE `bookings` ADD COLUMN `groupTag` VARCHAR(24) NULL,
  ADD INDEX `bookings_groupTag_idx`(`groupTag`);
