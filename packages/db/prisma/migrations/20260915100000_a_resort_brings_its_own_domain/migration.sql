-- A domain a resort brought with it (2026-09-15 design).
--
-- `host` is unique platform-wide rather than per resort: two resorts answering
-- at one name has no correct resolution, and the constraint is the only thing
-- that makes "claimed" mean anything.
CREATE TABLE `resort_domains` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `resortId` INTEGER NOT NULL,
  `host` VARCHAR(253) NOT NULL,
  `token` VARCHAR(64) NOT NULL,
  `verifiedAt` DATETIME(3) NULL,
  `provisionedAt` DATETIME(3) NULL,
  `canonical` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `resort_domains_host_key`(`host`),
  INDEX `resort_domains_resortId_idx`(`resortId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `resort_domains` ADD CONSTRAINT `resort_domains_resortId_fkey`
  FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
