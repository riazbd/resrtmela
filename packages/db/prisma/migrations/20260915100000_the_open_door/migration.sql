-- The open door (2026-09-11 design, phase 5).
--
-- Selling access stops being a row. An agency may sell a resort when it is
-- verified and paid up, the resort is open to agents, and the resort has not
-- blocked it — computed on every request, not frozen into a login token.
--
-- `user_resorts` goes back to meaning one thing, "works here". The owner
-- decided (2026-09-11) that the per-resort request-and-approve flow goes, and
-- with it every agent's row in that table. A resort that already had agents
-- selling is opened here, so nobody who sells today stops on the day this
-- lands. The requests themselves (`resort_access`) are left where they are.

ALTER TABLE `resorts` ADD COLUMN `agentsOpen` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `resort_agencies` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `resortId` INTEGER NOT NULL,
  `accountId` INTEGER NOT NULL,
  `blocked` BOOLEAN NOT NULL DEFAULT false,
  `commissionKind` VARCHAR(8) NULL,
  `commissionRate` DECIMAL(10, 2) NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `resort_agencies_resortId_accountId_key`(`resortId`, `accountId`),
  INDEX `resort_agencies_accountId_idx`(`accountId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `resort_agencies` ADD CONSTRAINT `resort_agencies_resortId_fkey`
  FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `resort_agencies` ADD CONSTRAINT `resort_agencies_accountId_fkey`
  FOREIGN KEY (`accountId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE `resorts` r
SET r.`agentsOpen` = true
WHERE EXISTS (
  SELECT 1 FROM `user_resorts` ur JOIN `users` u ON u.`id` = ur.`userId`
  WHERE ur.`resortId` = r.`id` AND u.`role` = 'AGENT'
);

-- the team list is staff by construction: an agency sells a resort, it does
-- not work there, and the platform owner passes every resort without a row
DELETE ur FROM `user_resorts` ur
JOIN `users` u ON u.`id` = ur.`userId`
WHERE u.`role` IN ('AGENT', 'SUPER_ADMIN');
