-- Idempotency for a front desk that loses its connection.
--
-- A payment taken while offline is queued on the device and replayed later.
-- Replay means the same request can arrive twice -- often because the first
-- one reached the server and its response was lost on the way back, which on
-- a hill-district connection is the common case. Without this the guest gets
-- a second receipt and the booking says it was overpaid.
--
-- MySQL treats NULLs as distinct in a unique index, which is exactly right
-- here: two cash notes handed over at the counter with no client reference
-- are two payments, and must stay two payments.

-- AlterTable
ALTER TABLE `payments` ADD COLUMN `clientRef` VARCHAR(64) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `payments_bookingId_clientRef_key` ON `payments`(`bookingId`, `clientRef`);

