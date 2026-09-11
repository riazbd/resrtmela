-- An offer brings a customer (2026-09-11 design, phase 4).
--
-- One object for a private invitation, a campaign, and what `invite-agent`
-- used to do. Every account remembers the offer it came through, which is the
-- first answer to "which channel brought this customer". Nothing to backfill:
-- the accounts already here came through no offer.

CREATE TABLE `offers` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(32) NOT NULL,
  `audience` VARCHAR(16) NOT NULL,
  `plan` VARCHAR(16) NOT NULL,
  `trialDays` INTEGER NULL,
  `discountPct` INTEGER NULL,
  `note` VARCHAR(191) NULL,
  `email` VARCHAR(191) NULL,
  `resortId` INTEGER NULL,
  `expiresAt` DATETIME(3) NULL,
  `maxUses` INTEGER NOT NULL DEFAULT 1,
  `uses` INTEGER NOT NULL DEFAULT 0,
  `createdById` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `offers_code_key`(`code`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `tenants` ADD COLUMN `offerId` INTEGER NULL;
CREATE INDEX `tenants_offerId_idx` ON `tenants`(`offerId`);
ALTER TABLE `tenants` ADD CONSTRAINT `tenants_offerId_fkey`
  FOREIGN KEY (`offerId`) REFERENCES `offers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
