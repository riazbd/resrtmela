-- Roles inside an agency.
--
-- An agency could add staff and every one of them got identical powers:
-- there was no way to hire a junior who books but cannot see the agency
-- money, which is the first thing anyone hiring a junior wants.
--
-- Separate from `roles` because that table is scoped to a resort, and an
-- agency staff work across every resort the agency has been approved for.
--
-- No rows are created. Existing staff keep a NULL role, which reads as the
-- default agent permissions -- exactly what they have today.

-- AlterTable
ALTER TABLE `users` ADD COLUMN `agentRoleId` INTEGER NULL;

-- CreateTable
CREATE TABLE `agent_roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `agencyId` INTEGER NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `permissions` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `agent_roles_agencyId_name_key`(`agencyId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_agentRoleId_fkey` FOREIGN KEY (`agentRoleId`) REFERENCES `agent_roles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_roles` ADD CONSTRAINT `agent_roles_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

