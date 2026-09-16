-- A domain belongs to a resort or to an account (an agency), exactly one.
ALTER TABLE `resort_domains` DROP FOREIGN KEY `resort_domains_resortId_fkey`;
ALTER TABLE `resort_domains` MODIFY `resortId` INTEGER NULL;
ALTER TABLE `resort_domains` ADD CONSTRAINT `resort_domains_resortId_fkey`
  FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `resort_domains` ADD COLUMN `accountId` INTEGER NULL;
CREATE INDEX `resort_domains_accountId_idx` ON `resort_domains`(`accountId`);
ALTER TABLE `resort_domains` ADD CONSTRAINT `resort_domains_accountId_fkey`
  FOREIGN KEY (`accountId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
