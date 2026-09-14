-- The API a resort builds against (2026-09-15 design).

-- What a key may do. Most integrations only read — a site that shows what is
-- free and prints a phone number — and handing that site a key that can also
-- write means a compromised plugin reaches the booking table.
ALTER TABLE `api_keys` ADD COLUMN `scopes` JSON NULL;

-- Which key made a booking, and what the caller called the request.
--
-- A direct link rather than a code from the resort's own BOOKING_SOURCE list:
-- "where did this come from" needs an answer that survives somebody renaming
-- their list, and revoking a key must make every booking it made findable.
ALTER TABLE `bookings` ADD COLUMN `apiKeyId` BIGINT NULL;
ALTER TABLE `bookings` ADD COLUMN `idempotencyKey` VARCHAR(120) NULL;

ALTER TABLE `bookings` ADD CONSTRAINT `bookings_apiKeyId_fkey`
  FOREIGN KEY (`apiKeyId`) REFERENCES `api_keys`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- The constraint is what makes a retry safe. A `findFirst` before an insert
-- races itself under exactly the conditions that produce a retry in the first
-- place; MySQL treats NULLs as distinct, so every panel booking is unaffected.
CREATE UNIQUE INDEX `bookings_resortId_idempotencyKey_key` ON `bookings`(`resortId`, `idempotencyKey`);
