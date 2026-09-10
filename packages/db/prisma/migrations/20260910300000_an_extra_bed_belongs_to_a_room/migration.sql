-- An extra bed belongs to a room, not to a room type.
--
-- Extra persons were allowed, capped and priced on `room_types`. Sky Eco has one
-- type covering nine rooms that are not one size: some take a third bed, some do
-- not, and the ones that do are not worth the same. A single number on the type
-- could not describe that inventory, so the resort left the feature switched off
-- and the "Extra persons" box never appeared on a booking form.
--
-- The type keeps its columns as the default a new room starts with — nobody
-- types the same rate nine times — and gains the bed count it never had.

ALTER TABLE `room_types`
  ADD COLUMN `extraPersonMax` INT NOT NULL DEFAULT 0;

ALTER TABLE `rooms`
  ADD COLUMN `extraPersonAllowed` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `extraPersonRate` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `extraPersonMax` INT NOT NULL DEFAULT 0;

-- A type that already allowed extra persons meant every room of it did, so each
-- room starts where its type left it. One bed unless the owner says otherwise:
-- the old model had no count at all, and inventing a larger number here would
-- be selling beds nobody has seen.
UPDATE `rooms` r
  JOIN `room_types` t ON t.`id` = r.`roomTypeId`
SET
  r.`extraPersonAllowed` = t.`extraPersonAllowed`,
  r.`extraPersonRate` = t.`extraPersonRate`,
  r.`extraPersonMax` = CASE WHEN t.`extraPersonAllowed` THEN 1 ELSE 0 END;

UPDATE `room_types`
SET `extraPersonMax` = 1
WHERE `extraPersonAllowed` = TRUE;
