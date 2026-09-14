-- A resort's own front door (2026-09-14 design, §5.1).

-- ── the address ──────────────────────────────────────────────────────────
--
-- A resort has never had a slug; the tenant has. The published site needs an
-- address that is stable, readable, and not the primary key — and unique across
-- the platform, because in phase 2 a resort's own domain resolves to exactly
-- one of these.
--
-- Added nullable, backfilled, then tightened: a NOT NULL column cannot be added
-- to a table that already has rows without a default, and a default here would
-- be a lie (every resort's address is its own).
ALTER TABLE `resorts` ADD COLUMN `slug` VARCHAR(80) NULL;

-- Lower-cased, every run of non-alphanumerics collapsed to one dash, and the
-- dashes trimmed off both ends. REGEXP_REPLACE exists on MySQL 8 and on
-- MariaDB 10.0+, which is both engines this schema runs on.
UPDATE `resorts`
SET `slug` = TRIM(BOTH '-' FROM LOWER(REGEXP_REPLACE(`name`, '[^a-zA-Z0-9]+', '-')));

-- A name that was entirely punctuation leaves nothing behind; those get the id.
UPDATE `resorts` SET `slug` = CONCAT('resort-', `id`) WHERE `slug` IS NULL OR `slug` = '';

-- Two resorts may well be called "Hill Resort". The later one keeps its id, so
-- the earlier keeps the clean address and nobody's is wrong.
CREATE TEMPORARY TABLE `_dup_slugs` AS
  SELECT `slug` FROM `resorts` GROUP BY `slug` HAVING COUNT(*) > 1;

UPDATE `resorts` r
SET r.`slug` = CONCAT(r.`slug`, '-', r.`id`)
WHERE r.`slug` IN (SELECT `slug` FROM `_dup_slugs`)
  AND r.`id` > (SELECT MIN(x.`id`) FROM (SELECT `id`, `slug` FROM `resorts`) x WHERE x.`slug` = r.`slug`);

DROP TEMPORARY TABLE `_dup_slugs`;

ALTER TABLE `resorts` MODIFY COLUMN `slug` VARCHAR(80) NOT NULL;
CREATE UNIQUE INDEX `resorts_slug_key` ON `resorts`(`slug`);

-- ── what the resort publishes ────────────────────────────────────────────
CREATE TABLE `resort_sites` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `resortId` INTEGER NOT NULL,
  `template` VARCHAR(24) NOT NULL DEFAULT 'sanctuary',
  `published` BOOLEAN NOT NULL DEFAULT false,
  `headline` VARCHAR(160) NULL,
  `intro` TEXT NULL,
  `amenities` JSON NULL,
  `themeColor` VARCHAR(16) NULL,
  `mapLat` DECIMAL(9, 6) NULL,
  `mapLng` DECIMAL(9, 6) NULL,
  `whatsapp` VARCHAR(32) NULL,
  `facebook` VARCHAR(191) NULL,
  `instagram` VARCHAR(191) NULL,
  `publishedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `resort_sites_resortId_key`(`resortId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── the files behind the pictures ────────────────────────────────────────
CREATE TABLE `uploads` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `resortId` INTEGER NOT NULL,
  `path` VARCHAR(255) NOT NULL,
  `mediaType` VARCHAR(64) NOT NULL,
  `bytes` INTEGER NOT NULL,
  `width` INTEGER NULL,
  `height` INTEGER NULL,
  `checksum` VARCHAR(64) NOT NULL,
  `uploadedById` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `uploads_path_key`(`path`),
  INDEX `uploads_resortId_idx`(`resortId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `resort_photos` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `resortId` INTEGER NOT NULL,
  `roomTypeId` INTEGER NULL,
  `uploadId` BIGINT NOT NULL,
  `alt` VARCHAR(191) NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `resort_photos_resortId_roomTypeId_idx`(`resortId`, `roomTypeId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `resort_sites` ADD CONSTRAINT `resort_sites_resortId_fkey`
  FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `uploads` ADD CONSTRAINT `uploads_resortId_fkey`
  FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `uploads` ADD CONSTRAINT `uploads_uploadedById_fkey`
  FOREIGN KEY (`uploadedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `resort_photos` ADD CONSTRAINT `resort_photos_resortId_fkey`
  FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `resort_photos` ADD CONSTRAINT `resort_photos_roomTypeId_fkey`
  FOREIGN KEY (`roomTypeId`) REFERENCES `room_types`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `resort_photos` ADD CONSTRAINT `resort_photos_uploadId_fkey`
  FOREIGN KEY (`uploadId`) REFERENCES `uploads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
