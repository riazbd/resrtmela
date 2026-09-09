-- AlterTable
ALTER TABLE `counters` ADD COLUMN `agencyId` INTEGER NULL,
    MODIFY `resortId` INTEGER NULL;

-- AlterTable
ALTER TABLE `employees` ADD COLUMN `agencyId` INTEGER NULL,
    MODIFY `resortId` INTEGER NULL;

-- AlterTable
ALTER TABLE `expenses` ADD COLUMN `agencyId` INTEGER NULL,
    ADD COLUMN `clientRef` VARCHAR(64) NULL,
    ADD COLUMN `headId` INTEGER NULL,
    MODIFY `resortId` INTEGER NULL;

-- AlterTable
ALTER TABLE `payroll_payments` ADD COLUMN `agencyId` INTEGER NULL,
    MODIFY `resortId` INTEGER NULL;

-- CreateTable
CREATE TABLE `expense_heads` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `agencyId` INTEGER NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `expense_heads_agencyId_name_key`(`agencyId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tour_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `agencyId` INTEGER NOT NULL,
    `parentId` INTEGER NULL,
    `name` VARCHAR(80) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tour_categories_agencyId_parentId_idx`(`agencyId`, `parentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tour_packages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `agencyId` INTEGER NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `summary` VARCHAR(500) NULL,
    `days` INTEGER NOT NULL DEFAULT 1,
    `nights` INTEGER NOT NULL DEFAULT 0,
    `pax` INTEGER NOT NULL DEFAULT 1,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `clientRef` VARCHAR(64) NULL,
    `createdById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `tour_packages_agencyId_idx`(`agencyId`),
    UNIQUE INDEX `tour_packages_agencyId_clientRef_key`(`agencyId`, `clientRef`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tour_package_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `packageId` INTEGER NOT NULL,
    `categoryId` INTEGER NULL,
    `label` VARCHAR(160) NOT NULL,
    `qty` DECIMAL(10, 2) NOT NULL DEFAULT 1,
    `unitCost` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `unitPrice` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `sort` INTEGER NOT NULL DEFAULT 0,

    INDEX `tour_package_items_packageId_idx`(`packageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_docs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `agencyId` INTEGER NOT NULL,
    `kind` ENUM('QUOTATION', 'INVOICE') NOT NULL,
    `number` VARCHAR(24) NOT NULL,
    `status` ENUM('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'PAID', 'VOID') NOT NULL DEFAULT 'DRAFT',
    `clientName` VARCHAR(160) NOT NULL,
    `clientEmail` VARCHAR(191) NULL,
    `clientPhone` VARCHAR(32) NULL,
    `clientAddress` VARCHAR(255) NULL,
    `guestId` INTEGER NULL,
    `packageId` INTEGER NULL,
    `issueDate` DATE NOT NULL,
    `validUntil` DATE NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'BDT',
    `discount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `taxRate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `amountPaid` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `terms` TEXT NULL,
    `convertedFromId` INTEGER NULL,
    `sentAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `createdById` INTEGER NULL,
    `clientRef` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sales_docs_convertedFromId_key`(`convertedFromId`),
    INDEX `sales_docs_agencyId_kind_status_idx`(`agencyId`, `kind`, `status`),
    INDEX `sales_docs_agencyId_guestId_idx`(`agencyId`, `guestId`),
    UNIQUE INDEX `sales_docs_agencyId_number_key`(`agencyId`, `number`),
    UNIQUE INDEX `sales_docs_agencyId_clientRef_key`(`agencyId`, `clientRef`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_doc_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `docId` INTEGER NOT NULL,
    `label` VARCHAR(200) NOT NULL,
    `details` VARCHAR(500) NULL,
    `qty` DECIMAL(10, 2) NOT NULL DEFAULT 1,
    `unitPrice` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `sort` INTEGER NOT NULL DEFAULT 0,

    INDEX `sales_doc_items_docId_idx`(`docId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `counters_agencyId_kind_key` ON `counters`(`agencyId`, `kind`);

-- CreateIndex
CREATE INDEX `employees_agencyId_idx` ON `employees`(`agencyId`);

-- CreateIndex
CREATE INDEX `expenses_agencyId_date_idx` ON `expenses`(`agencyId`, `date`);

-- CreateIndex
CREATE UNIQUE INDEX `expenses_agencyId_clientRef_key` ON `expenses`(`agencyId`, `clientRef`);

-- CreateIndex
CREATE INDEX `payroll_payments_agencyId_month_idx` ON `payroll_payments`(`agencyId`, `month`);

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payroll_payments` ADD CONSTRAINT `payroll_payments_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_headId_fkey` FOREIGN KEY (`headId`) REFERENCES `expense_heads`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expense_heads` ADD CONSTRAINT `expense_heads_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `counters` ADD CONSTRAINT `counters_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tour_categories` ADD CONSTRAINT `tour_categories_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tour_categories` ADD CONSTRAINT `tour_categories_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `tour_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tour_packages` ADD CONSTRAINT `tour_packages_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tour_package_items` ADD CONSTRAINT `tour_package_items_packageId_fkey` FOREIGN KEY (`packageId`) REFERENCES `tour_packages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tour_package_items` ADD CONSTRAINT `tour_package_items_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `tour_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_docs` ADD CONSTRAINT `sales_docs_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_docs` ADD CONSTRAINT `sales_docs_guestId_fkey` FOREIGN KEY (`guestId`) REFERENCES `guests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_docs` ADD CONSTRAINT `sales_docs_packageId_fkey` FOREIGN KEY (`packageId`) REFERENCES `tour_packages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_docs` ADD CONSTRAINT `sales_docs_convertedFromId_fkey` FOREIGN KEY (`convertedFromId`) REFERENCES `sales_docs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_doc_items` ADD CONSTRAINT `sales_doc_items_docId_fkey` FOREIGN KEY (`docId`) REFERENCES `sales_docs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

