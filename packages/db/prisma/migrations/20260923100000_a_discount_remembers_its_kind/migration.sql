-- What was typed, beside what it came to. Every existing discount was an amount.
ALTER TABLE `bookings` ADD COLUMN `discountKind` VARCHAR(8) NOT NULL DEFAULT 'FLAT';
ALTER TABLE `bookings` ADD COLUMN `discountValue` DECIMAL(10, 2) NOT NULL DEFAULT 0.00;
UPDATE `bookings` SET `discountValue` = `discount`;
