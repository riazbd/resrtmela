-- Tax stops being one number.
--
-- `Resort.taxRatePct` was a single percentage on the whole booking. Bangladesh
-- charges 15% VAT; hotels here commonly add a 10% service charge to the room
-- that VAT is then charged on; the restaurant is taxed at its own rate; and a
-- menu price is usually quoted with the VAT already inside it. One percentage
-- can say none of that. Worse, `fb_bills` had no tax column at all, so a
-- restaurant bill could not carry VAT even in principle.

CREATE TABLE `tax_rules` (
  `id`        INTEGER       NOT NULL AUTO_INCREMENT,
  `resortId`  INTEGER       NOT NULL,
  `code`      VARCHAR(24)   NOT NULL,
  `label`     VARCHAR(60)   NOT NULL,
  `ratePct`   DECIMAL(6, 3) NOT NULL,
  `appliesTo` VARCHAR(16)   NOT NULL DEFAULT 'ALL',
  `inclusive` BOOLEAN       NOT NULL DEFAULT false,
  `compound`  BOOLEAN       NOT NULL DEFAULT false,
  `sortOrder` INTEGER       NOT NULL DEFAULT 0,
  `active`    BOOLEAN       NOT NULL DEFAULT true,
  `createdAt` DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3)   NOT NULL,
  UNIQUE INDEX `tax_rules_resortId_code_key`(`resortId`, `code`),
  INDEX `tax_rules_resortId_active_idx`(`resortId`, `active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `tax_rules`
  ADD CONSTRAINT `tax_rules_resortId_fkey`
  FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- A VAT invoice in Bangladesh has to show the seller's BIN.
ALTER TABLE `resorts` ADD COLUMN `binNumber` VARCHAR(32) NULL;

-- The restaurant can carry tax now. Stored rather than only computed, because a
-- bill printed last year has to keep saying what it said even after the rules
-- change.
ALTER TABLE `fb_bills` ADD COLUMN `taxAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00;

-- Every resort already charging tax keeps charging exactly what it charged: the
-- old flat rate becomes one exclusive rule on the whole bill, which is what the
-- money function does with a single rate anyway. A resort on 0 gets no rule and
-- no change.
INSERT INTO `tax_rules` (`resortId`, `code`, `label`, `ratePct`, `appliesTo`, `inclusive`, `compound`, `sortOrder`, `active`, `createdAt`, `updatedAt`)
SELECT r.`id`, 'VAT', 'VAT', r.`taxRatePct`, 'ALL', false, false, 0, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `resorts` r
WHERE r.`taxRatePct` > 0;
