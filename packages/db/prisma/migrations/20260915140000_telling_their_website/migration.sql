-- Telling a resort's own website what changed (2026-09-15 design, §6).
--
-- A row rather than a fire-and-forget request: outbound HTTP with retries is a
-- queue whether or not anybody calls it one, and "did they get it" is a
-- question the resort will ask.
CREATE TABLE `webhook_endpoints` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `resortId` INTEGER NOT NULL,
  `url` VARCHAR(500) NOT NULL,
  `secret` VARCHAR(64) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `webhook_endpoints_resortId_idx`(`resortId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `webhook_deliveries` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `endpointId` INTEGER NOT NULL,
  `event` VARCHAR(40) NOT NULL,
  `payload` JSON NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `nextAttemptAt` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastStatus` INTEGER NULL,
  `lastError` VARCHAR(255) NULL,
  `deliveredAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `webhook_deliveries_nextAttemptAt_deliveredAt_idx`(`nextAttemptAt`, `deliveredAt`),
  INDEX `webhook_deliveries_endpointId_createdAt_idx`(`endpointId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `webhook_endpoints` ADD CONSTRAINT `webhook_endpoints_resortId_fkey`
  FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `webhook_deliveries` ADD CONSTRAINT `webhook_deliveries_endpointId_fkey`
  FOREIGN KEY (`endpointId`) REFERENCES `webhook_endpoints`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
