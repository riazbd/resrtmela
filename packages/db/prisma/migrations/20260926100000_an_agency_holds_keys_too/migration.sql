-- A key belongs to a resort or to an account (an agency), exactly one of the two.
-- The foreign key is dropped and put back around the change: MySQL refuses to
-- alter a column a constraint is leaning on.
ALTER TABLE `api_keys` DROP FOREIGN KEY `api_keys_resortId_fkey`;
ALTER TABLE `api_keys` MODIFY `resortId` INTEGER NULL;
ALTER TABLE `api_keys` ADD CONSTRAINT `api_keys_resortId_fkey` FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `api_keys` ADD COLUMN `accountId` INTEGER NULL;
CREATE INDEX `api_keys_accountId_idx` ON `api_keys`(`accountId`);
ALTER TABLE `api_keys` ADD CONSTRAINT `api_keys_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
