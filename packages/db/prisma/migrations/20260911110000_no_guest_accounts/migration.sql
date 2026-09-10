-- A guest is a row in a resort's register, never an account.
--
-- The owner decided on 2026-09-11 that the platform sells to resorts and
-- travel agencies only. The login code that minted GUEST accounts is removed
-- in the same change, so these rows are accounts with nothing left to open.
-- All production data is demo data, so they are deleted, not converted.
--
-- What goes with them: every foreign key onto `users` is either ON DELETE
-- SET NULL (bookings.createdById, bookings.agentUserId, payments.receivedById,
-- audit_log.actorId, users.parentAgentId) - the booking and the history stay,
-- no longer attributed to anyone - or ON DELETE CASCADE (the account's own
-- notifications, wallet, resort links, password resets and the like).
--
-- Then the enum loses the value, so the database refuses a GUEST row rather
-- than trusting every writer not to make one. The delete has to come first:
-- a strict server refuses the MODIFY while a GUEST row exists, and a lax one
-- would quietly rewrite that row's role to ''.
--
-- Data-only on purpose, and kept apart from removing the `otp_codes` table
-- (20260911110500_login_codes_are_gone): baseline-db.mjs marks a migration
-- that only removes things as applied, without running it, when the thing is
-- already gone - and a delete sharing that file would be skipped along with it.
DELETE FROM `users` WHERE `role` = 'GUEST';

ALTER TABLE `users` MODIFY `role` ENUM('SUPER_ADMIN', 'RESORT_ADMIN', 'MANAGER', 'FRONT_DESK', 'AGENT', 'HOUSEKEEPING') NOT NULL;
