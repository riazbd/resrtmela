-- Whether a room has been cleaned since the last guest left.
--
-- Every existing room becomes CLEAN. That is the honest default for a
-- column arriving mid-life: nobody has told us otherwise, and marking a
-- hundred occupied rooms dirty on the morning this deploys would hand the
-- housekeeper a list that is entirely wrong.
--
-- Three states, not four. The supervisor's INSPECTED tick belongs to a
-- larger hotel; at this size the person cleaning and the person checking
-- are the same person.
ALTER TABLE `rooms`
  ADD COLUMN `housekeeping` ENUM('DIRTY', 'CLEANING', 'CLEAN') NOT NULL DEFAULT 'CLEAN',
  ADD COLUMN `housekeepingAt` DATETIME(3) NULL,
  ADD COLUMN `housekeepingById` INTEGER NULL;

CREATE INDEX `rooms_housekeepingById_idx` ON `rooms`(`housekeepingById`);

ALTER TABLE `rooms` ADD CONSTRAINT `rooms_housekeepingById_fkey`
  FOREIGN KEY (`housekeepingById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
