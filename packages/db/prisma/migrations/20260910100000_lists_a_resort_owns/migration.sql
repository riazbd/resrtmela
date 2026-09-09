-- Three enums stop being facts about the software.
--
-- `PaymentMethod`, `BookingSource` and `ActivityCategory` decided, in the
-- schema, how a resort could be paid, where a booking could come from and what
-- kind of thing an activity could be. Extending any of them meant a migration
-- and a deploy. They are rows now, in one table, so the next list costs a
-- registry entry rather than a table, a service and a screen.

CREATE TABLE `resort_options` (
  `id`        INTEGER      NOT NULL AUTO_INCREMENT,
  `resortId`  INTEGER      NOT NULL,
  `list`      VARCHAR(32)  NOT NULL,
  `code`      VARCHAR(32)  NOT NULL,
  `label`     VARCHAR(60)  NOT NULL,
  `sortOrder` INTEGER      NOT NULL DEFAULT 0,
  `active`    BOOLEAN      NOT NULL DEFAULT true,
  `meta`      LONGTEXT     NULL,
  `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3)  NOT NULL,
  UNIQUE INDEX `resort_options_resortId_list_code_key`(`resortId`, `list`, `code`),
  INDEX `resort_options_resortId_list_active_idx`(`resortId`, `list`, `active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `resort_options`
  ADD CONSTRAINT `resort_options_resortId_fkey`
  FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- The columns that carried the enums. MySQL and MariaDB both convert an ENUM to
-- its label text on widening, so existing rows keep saying what they said.
ALTER TABLE `payments`         MODIFY COLUMN `method` VARCHAR(32) NOT NULL DEFAULT 'CASH';
ALTER TABLE `fb_bills`         MODIFY COLUMN `method` VARCHAR(32) NULL;
ALTER TABLE `payroll_payments` MODIFY COLUMN `method` VARCHAR(32) NULL;
ALTER TABLE `payment_intents`  MODIFY COLUMN `method` VARCHAR(32) NOT NULL;
ALTER TABLE `activity_catalog` MODIFY COLUMN `category` VARCHAR(32) NULL;

-- Booking source becomes nullable as well as dynamic. It defaulted to DIRECT,
-- so a sheet with an empty Source column filed every one of those stays as a
-- direct booking: in the client's own workbook that is 79 rows of 96 claimed as
-- Direct on the strength of a blank cell, and the source-mix report repeated
-- the claim back to the owner as fact. Nothing recorded is now nothing
-- recorded.
ALTER TABLE `bookings` MODIFY COLUMN `source` VARCHAR(32) NULL DEFAULT NULL;

-- Existing resorts get their lists here rather than lazily, so that a value a
-- resort has genuinely used is never one it suddenly cannot record. New
-- resorts seed from the platform setting on first read instead.
INSERT INTO `resort_options` (`resortId`, `list`, `code`, `label`, `sortOrder`, `active`, `createdAt`, `updatedAt`)
SELECT r.`id`, d.`list`, d.`code`, d.`label`, d.`ord`, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `resorts` r
CROSS JOIN (
            SELECT 'PAYMENT_METHOD'    AS `list`, 'CASH'          AS `code`, 'Cash'          AS `label`, 0 AS `ord`
  UNION ALL SELECT 'PAYMENT_METHOD',            'BKASH',                  'bKash',               1
  UNION ALL SELECT 'PAYMENT_METHOD',            'NAGAD',                  'Nagad',               2
  UNION ALL SELECT 'PAYMENT_METHOD',            'CARD',                   'Card',                3
  UNION ALL SELECT 'PAYMENT_METHOD',            'BANK',                   'Bank transfer',       4
  UNION ALL SELECT 'BOOKING_SOURCE',            'DIRECT',                 'Direct',              0
  UNION ALL SELECT 'BOOKING_SOURCE',            'AGENT',                  'Agent',               1
  UNION ALL SELECT 'BOOKING_SOURCE',            'FACEBOOK',               'Facebook',            2
  UNION ALL SELECT 'BOOKING_SOURCE',            'WHATSAPP',               'WhatsApp',            3
  UNION ALL SELECT 'BOOKING_SOURCE',            'PHONE',                  'Phone',               4
  UNION ALL SELECT 'BOOKING_SOURCE',            'APP',                    'App',                 5
  UNION ALL SELECT 'ACTIVITY_CATEGORY',         'TOUR',                   'Tour',                0
  UNION ALL SELECT 'ACTIVITY_CATEGORY',         'WATER_SPORTS',           'Water sports',        1
  UNION ALL SELECT 'ACTIVITY_CATEGORY',         'WELLNESS',               'Wellness',            2
  UNION ALL SELECT 'ACTIVITY_CATEGORY',         'DINING',                 'Dining',              3
  UNION ALL SELECT 'ACTIVITY_CATEGORY',         'ENTERTAINMENT',          'Entertainment',       4
  UNION ALL SELECT 'ACTIVITY_CATEGORY',         'OTHER',                  'Other',               5
) d;

-- And anything a resort actually used that those defaults do not name. The data
-- is the authority on what a resort accepts, not a list written here.
INSERT INTO `resort_options` (`resortId`, `list`, `code`, `label`, `sortOrder`, `active`, `createdAt`, `updatedAt`)
SELECT b.`resortId`, 'PAYMENT_METHOD', p.`method`, p.`method`, 90, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `payments` p JOIN `bookings` b ON b.`id` = p.`bookingId`
WHERE p.`method` <> 'WALLET_CREDIT'
GROUP BY b.`resortId`, p.`method`
ON DUPLICATE KEY UPDATE `resort_options`.`code` = `resort_options`.`code`;

INSERT INTO `resort_options` (`resortId`, `list`, `code`, `label`, `sortOrder`, `active`, `createdAt`, `updatedAt`)
SELECT b.`resortId`, 'BOOKING_SOURCE', b.`source`, b.`source`, 90, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `bookings` b
WHERE b.`source` IS NOT NULL
GROUP BY b.`resortId`, b.`source`
ON DUPLICATE KEY UPDATE `resort_options`.`code` = `resort_options`.`code`;
