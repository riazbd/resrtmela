-- A discount on one particular room.
--
-- "ROOM" scope actually meant a room TYPE, which cannot express the case an
-- owner asks for: one room is noisy, or faces the generator, or is the last
-- one left on a slow Tuesday, so it goes cheaper than its identical
-- neighbour.
--
-- Existing ROOM rows carry a roomTypeId, so they are renamed to what they
-- have always been -- ROOM_TYPE -- and ROOM is freed for the real thing.
-- Widening the column first: ROOM_TYPE does not fit in VARCHAR(8).

-- AlterTable
ALTER TABLE `discount_offers` ADD COLUMN `roomId` INTEGER NULL,
    MODIFY `scope` VARCHAR(10) NOT NULL DEFAULT 'RESORT';

-- AddForeignKey
ALTER TABLE `discount_offers` ADD CONSTRAINT `discount_offers_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `rooms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing per-type offers keep working, under the name that describes them.
UPDATE `discount_offers` SET `scope` = 'ROOM_TYPE' WHERE `scope` = 'ROOM' AND `roomTypeId` IS NOT NULL;
