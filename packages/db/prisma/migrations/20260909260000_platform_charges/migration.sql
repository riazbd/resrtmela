-- CreateTable
CREATE TABLE `platform_charges` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `resortId` INTEGER NOT NULL,
    `kind` VARCHAR(24) NOT NULL,
    `description` VARCHAR(160) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DUE',
    `clientRef` VARCHAR(64) NULL,
    `createdById` INTEGER NULL,
    `paidAt` DATETIME(3) NULL,
    `note` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `platform_charges_resortId_status_idx`(`resortId`, `status`),
    UNIQUE INDEX `platform_charges_resortId_clientRef_key`(`resortId`, `clientRef`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `platform_charges` ADD CONSTRAINT `platform_charges_resortId_fkey` FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

