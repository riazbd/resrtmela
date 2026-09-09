-- Which agency an agent works for.
--
-- "My staff" was inferred from "shares a resort with me", so two agencies
-- selling the same resort -- the normal case, not the unusual one -- saw each
-- other, including their people, phone numbers and email addresses.
--
-- Existing rows stay NULL: every agent that exists today is treated as an
-- agency in its own right, which is the safe reading. Nobody loses access to
-- a booking; a staff list simply stops containing strangers.

-- AlterTable
ALTER TABLE `users` ADD COLUMN `parentAgentId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_parentAgentId_fkey` FOREIGN KEY (`parentAgentId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

