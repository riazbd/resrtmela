-- An agency's own page (2026-09-17 design, §1, §4).

-- An upload belongs to a resort or to an account, exactly one. The foreign key
-- is dropped and put back around the change: MySQL refuses to alter a column a
-- constraint leans on.
ALTER TABLE `uploads` DROP FOREIGN KEY `uploads_resortId_fkey`;
ALTER TABLE `uploads` MODIFY `resortId` INTEGER NULL;
ALTER TABLE `uploads` ADD CONSTRAINT `uploads_resortId_fkey`
  FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `uploads` ADD COLUMN `accountId` INTEGER NULL;
CREATE INDEX `uploads_accountId_idx` ON `uploads`(`accountId`);
ALTER TABLE `uploads` ADD CONSTRAINT `uploads_accountId_fkey`
  FOREIGN KEY (`accountId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `agency_sites` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `accountId` INTEGER NOT NULL,
  `published` BOOLEAN NOT NULL DEFAULT false,
  `publishedAt` DATETIME(3) NULL,
  `headline` VARCHAR(160) NULL,
  `intro` TEXT NULL,
  `themeColor` VARCHAR(16) NULL,
  `phone` VARCHAR(32) NULL,
  `email` VARCHAR(191) NULL,
  `whatsapp` VARCHAR(32) NULL,
  `address` VARCHAR(255) NULL,
  `facebook` VARCHAR(191) NULL,
  `instagram` VARCHAR(191) NULL,
  `hiddenResortIds` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `agency_sites_accountId_key`(`accountId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `agency_sites` ADD CONSTRAINT `agency_sites_accountId_fkey`
  FOREIGN KEY (`accountId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `agency_photos` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `accountId` INTEGER NOT NULL,
  `uploadId` BIGINT NOT NULL,
  `alt` VARCHAR(191) NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `agency_photos_accountId_idx`(`accountId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `agency_photos` ADD CONSTRAINT `agency_photos_accountId_fkey`
  FOREIGN KEY (`accountId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `agency_photos` ADD CONSTRAINT `agency_photos_uploadId_fkey`
  FOREIGN KEY (`uploadId`) REFERENCES `uploads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
