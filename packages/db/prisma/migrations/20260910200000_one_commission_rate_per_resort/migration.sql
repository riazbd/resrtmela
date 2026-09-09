-- One commission rate per resort, instead of one per agent.
--
-- `user_resorts.commissionRate` / `commissionKind` stay exactly where they are:
-- they hold what each agent used to be on, and deleting the record of a
-- commercial term is not this migration's business. Nothing reads them for
-- pricing after this.
ALTER TABLE `resorts`
  ADD COLUMN `agentCommissionKind` VARCHAR(8) NOT NULL DEFAULT 'PERCENT',
  ADD COLUMN `agentCommissionRate` DECIMAL(10, 2) NOT NULL DEFAULT 5.00;

-- Seed each resort with the terms most of its agents were already on, so no
-- agent's pay changes on the day this deploys. Ties break on the higher rate:
-- when a resort is genuinely split, the generous reading is the one that does
-- not quietly cut somebody's earnings.
--
-- A resort with no agents keeps the 5% default.
UPDATE `resorts` r
JOIN (
  SELECT `resortId`, `commissionKind`, `commissionRate`
  FROM (
    SELECT
      ur.`resortId`,
      ur.`commissionKind`,
      ur.`commissionRate`,
      ROW_NUMBER() OVER (
        PARTITION BY ur.`resortId`
        ORDER BY COUNT(*) DESC, ur.`commissionRate` DESC
      ) AS rn
    FROM `user_resorts` ur
    JOIN `users` u ON u.`id` = ur.`userId` AND u.`role` = 'AGENT'
    WHERE ur.`commissionRate` IS NOT NULL AND ur.`commissionRate` > 0
    GROUP BY ur.`resortId`, ur.`commissionKind`, ur.`commissionRate`
  ) ranked
  WHERE rn = 1
) t ON t.`resortId` = r.`id`
SET
  r.`agentCommissionKind` = t.`commissionKind`,
  r.`agentCommissionRate` = t.`commissionRate`;
