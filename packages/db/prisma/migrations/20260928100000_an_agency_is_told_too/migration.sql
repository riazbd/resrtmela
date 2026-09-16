-- A webhook endpoint belongs to a resort or to an account (an agency), exactly one.
ALTER TABLE `webhook_endpoints` DROP FOREIGN KEY `webhook_endpoints_resortId_fkey`;
ALTER TABLE `webhook_endpoints` MODIFY `resortId` INTEGER NULL;
ALTER TABLE `webhook_endpoints` ADD CONSTRAINT `webhook_endpoints_resortId_fkey`
  FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `webhook_endpoints` ADD COLUMN `accountId` INTEGER NULL;
CREATE INDEX `webhook_endpoints_accountId_idx` ON `webhook_endpoints`(`accountId`);
ALTER TABLE `webhook_endpoints` ADD CONSTRAINT `webhook_endpoints_accountId_fkey`
  FOREIGN KEY (`accountId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
