-- A resort writes its own words to its own guests.
--
-- Every message went out in wording compiled into the build: a resort could
-- not add their check-in time, write it in Bangla, or soften a payment
-- reminder for a repeat customer. This is the part of the product the guest
-- actually sees, so "nothing hardcoded" has to reach it.
--
-- No rows are seeded. An absent row means the built-in wording, so a new
-- resort works on day one without writing eight messages first.

-- CreateTable
CREATE TABLE `message_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `resortId` INTEGER NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `body` VARCHAR(600) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `message_templates_resortId_name_key`(`resortId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `message_templates` ADD CONSTRAINT `message_templates_resortId_fkey` FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

