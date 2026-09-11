-- The agency is a customer (2026-09-11 design, phase 3).
--
-- An agency was a login, not a business: nothing the platform could verify,
-- bill or stop. Every agency user now belongs to an account (a tenant of kind
-- AGENCY). The agencies already selling are given theirs here, active — they
-- were admitted by the resorts they sell for, and taking their selling away on
-- the day this lands would be a change of terms nobody decided. New agencies
-- arrive through signup, pending, and the platform verifies them.

ALTER TABLE `users` ADD COLUMN `accountId` INTEGER NULL;
CREATE INDEX `users_accountId_idx` ON `users`(`accountId`);
ALTER TABLE `users` ADD CONSTRAINT `users_accountId_fkey`
  FOREIGN KEY (`accountId`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- one account per agency: an AGENT with no parent is an agency in its own right
INSERT INTO `tenants` (`name`, `slug`, `kind`, `status`, `createdAt`)
SELECT LEFT(u.`name`, 120), CONCAT('agency-', u.`id`), 'AGENCY', 'active', u.`createdAt`
FROM `users` u
WHERE u.`role` = 'AGENT' AND u.`parentAgentId` IS NULL
  AND NOT EXISTS (SELECT 1 FROM `tenants` t WHERE t.`slug` = CONCAT('agency-', u.`id`));

UPDATE `users` u
JOIN `tenants` t ON t.`slug` = CONCAT('agency-', u.`id`)
SET u.`accountId` = t.`id`
WHERE u.`role` = 'AGENT' AND u.`parentAgentId` IS NULL AND u.`accountId` IS NULL;

-- an agency's staff sell for the agency's account
UPDATE `users` s
JOIN `users` p ON p.`id` = s.`parentAgentId`
SET s.`accountId` = p.`accountId`
WHERE s.`role` = 'AGENT' AND s.`accountId` IS NULL;
