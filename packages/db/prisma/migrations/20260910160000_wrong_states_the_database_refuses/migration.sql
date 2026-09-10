-- Five things that could go wrong and now cannot.
--
-- Each was reachable by ordinary use, not by abuse, and each was invisible
-- afterwards. Existing rows are settled first in every case, because an index
-- cannot be added over data that already violates it.

-- ── 1. A guest is one guest ────────────────────────────────────────────────
-- `Guest.phoneKey` was documented as a dedup key and indexed, but not unique.
-- Two concurrent bookings for the same number, or one offline write replayed,
-- each created their own row and the guest's history split. Worse, a walk-in
-- with no phone was keyed on a hash of their *name*, so every guest called
-- "local" — the most common booking in the client's own workbook — was one row
-- owning hundreds of unrelated stays.
--
-- Give every duplicate beyond the first a key of its own, oldest kept. The
-- application does the same for anyone without a number from here on.
UPDATE `guests` g
JOIN (
  SELECT g2.`id`, ROW_NUMBER() OVER (PARTITION BY g2.`resortId`, g2.`phoneKey` ORDER BY g2.`id`) AS rn
  FROM `guests` g2
) d ON d.`id` = g.`id`
SET g.`phoneKey` = SHA2(CONCAT('split:', g.`id`), 256)
WHERE d.rn > 1;

DROP INDEX `guests_phoneKey_idx` ON `guests`;
CREATE UNIQUE INDEX `guests_resortId_phoneKey_key` ON `guests`(`resortId`, `phoneKey`);

-- ── 2. An invoice serial is a serial ───────────────────────────────────────
-- A duplicated VAT invoice number is a problem with the VAT office, and the
-- resort's BIN is printed on that document now.
UPDATE `bookings` b
JOIN (
  SELECT b2.`id`, ROW_NUMBER() OVER (PARTITION BY b2.`resortId`, b2.`invoiceNo` ORDER BY b2.`id`) AS rn
  FROM `bookings` b2 WHERE b2.`invoiceNo` IS NOT NULL
) d ON d.`id` = b.`id`
SET b.`invoiceNo` = NULL
WHERE d.rn > 1;

CREATE UNIQUE INDEX `bookings_resortId_invoiceNo_key` ON `bookings`(`resortId`, `invoiceNo`);

-- ── 3. The offline desk's replay guard, on the side that is offline ────────
-- `UNIQUE(agencyId, clientRef)` existed and `UNIQUE(resortId, clientRef)` did
-- not — and the resort side is the one with the offline front desk.
UPDATE `expenses` e
JOIN (
  SELECT e2.`id`, ROW_NUMBER() OVER (PARTITION BY e2.`resortId`, e2.`clientRef` ORDER BY e2.`id`) AS rn
  FROM `expenses` e2 WHERE e2.`clientRef` IS NOT NULL AND e2.`resortId` IS NOT NULL
) d ON d.`id` = e.`id`
SET e.`clientRef` = NULL
WHERE d.rn > 1;

CREATE UNIQUE INDEX `expenses_resortId_clientRef_key` ON `expenses`(`resortId`, `clientRef`);

-- ── 4. Indexes that lead on the tenant ─────────────────────────────────────
-- Every real query is `WHERE resortId = ? AND ...`, so an index leading on
-- `state` was either ignored or scanned across every tenant's bookings. And
-- `groupTag` values are generated per resort (GRP-0001), so they collide
-- between tenants and the index has to say which resort it means.
DROP INDEX `bookings_state_paymentState_idx` ON `bookings`;
CREATE INDEX `bookings_resortId_state_deletedAt_idx` ON `bookings`(`resortId`, `state`, `deletedAt`);
DROP INDEX `bookings_groupTag_idx` ON `bookings`;
CREATE INDEX `bookings_resortId_groupTag_idx` ON `bookings`(`resortId`, `groupTag`);

-- ── 5. Rows that pointed at nothing ────────────────────────────────────────
-- Four tenancy columns were bare integers with no foreign key, so deleting a
-- resort left notification jobs that would still be dispatched, payment intents
-- that could still be settled, and bell notifications and campaigns belonging to
-- nobody. Orphans are cleared first; the constraint keeps it that way.
DELETE FROM `notification_jobs` WHERE `resortId` IS NOT NULL AND `resortId` NOT IN (SELECT `id` FROM `resorts`);
DELETE FROM `payment_intents`   WHERE `resortId` NOT IN (SELECT `id` FROM `resorts`);
DELETE FROM `notifications`     WHERE `resortId` IS NOT NULL AND `resortId` NOT IN (SELECT `id` FROM `resorts`);
DELETE FROM `email_campaigns`   WHERE `resortId` IS NOT NULL AND `resortId` NOT IN (SELECT `id` FROM `resorts`);

ALTER TABLE `notification_jobs` ADD CONSTRAINT `notification_jobs_resortId_fkey` FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `payment_intents`   ADD CONSTRAINT `payment_intents_resortId_fkey`   FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `notifications`     ADD CONSTRAINT `notifications_resortId_fkey`     FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `email_campaigns`   ADD CONSTRAINT `email_campaigns_resortId_fkey`   FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
