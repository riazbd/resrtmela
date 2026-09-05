-- CreateTable
CREATE TABLE `activity_schedules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `catalogId` INTEGER NOT NULL,
    `weekday` INTEGER NOT NULL,
    `startTime` VARCHAR(5) NOT NULL,
    `endTime` VARCHAR(5) NOT NULL,
    `capacity` INTEGER NOT NULL DEFAULT 10,
    `active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `activity_schedules_catalogId_idx`(`catalogId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `activity_schedules` ADD CONSTRAINT `activity_schedules_catalogId_fkey` FOREIGN KEY (`catalogId`) REFERENCES `activity_catalog`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
