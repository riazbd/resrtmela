-- A room can leave the inventory without leaving the history.
--
-- There was no way to remove a room at all: no DELETE route, and
-- `OUT_OF_SERVICE` means something else (temporarily unsellable, still in the
-- inventory). A room with no stay behind it is now deleted outright; one that
-- has been sold is retired here instead, because `booking_items.roomId` points
-- at it and deleting it would take the rooms out of past bookings and invoices.
ALTER TABLE `rooms` ADD COLUMN `deletedAt` DATETIME(3) NULL;
CREATE INDEX `rooms_resortId_deletedAt_idx` ON `rooms`(`resortId`, `deletedAt`);
