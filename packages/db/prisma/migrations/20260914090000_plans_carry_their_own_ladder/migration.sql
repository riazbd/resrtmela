-- A price becomes a ladder the owner writes, instead of two numbers in two
-- columns and two rhythm names in a TypeScript array.
--
-- Nothing is dropped here and no price changes. Every plan gets a schedule
-- built from the fees it already has, every live subscription is pointed at
-- the schedule matching the rhythm it is already on, and `monthlyFee`,
-- `yearlyFee`, `billingCycle` and `pendingCycle` are all left exactly where
-- they are. They come out in a migration of their own, once the services read
-- schedules and the data has been checked in its new home.

CREATE TABLE `plan_schedules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `planId` BIGINT NOT NULL,
    `label` VARCHAR(40) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `plan_schedules_planId_idx`(`planId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `plan_phases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `scheduleId` INTEGER NOT NULL,
    `seq` INTEGER NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 1,
    `unit` VARCHAR(8) NOT NULL DEFAULT 'MONTH',
    `price` DECIMAL(10, 2) NOT NULL,
    `repeats` INTEGER NULL,

    UNIQUE INDEX `plan_phases_scheduleId_seq_key`(`scheduleId`, `seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `plan_schedules` ADD CONSTRAINT `plan_schedules_planId_fkey`
    FOREIGN KEY (`planId`) REFERENCES `platform_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `plan_phases` ADD CONSTRAINT `plan_phases_scheduleId_fkey`
    FOREIGN KEY (`scheduleId`) REFERENCES `plan_schedules`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `subscriptions`
    ADD COLUMN `scheduleId` INTEGER NULL,
    ADD COLUMN `phaseSeq` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `phaseDone` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `phaseStartedAt` DATETIME(3) NULL,
    ADD COLUMN `pendingScheduleId` INTEGER NULL;

CREATE INDEX `subscriptions_scheduleId_idx` ON `subscriptions`(`scheduleId`);

ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_scheduleId_fkey`
    FOREIGN KEY (`scheduleId`) REFERENCES `plan_schedules`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_pendingScheduleId_fkey`
    FOREIGN KEY (`pendingScheduleId`) REFERENCES `plan_schedules`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ── the prices that already exist, moved into their new home ──────────────
--
-- One rung, running forever: which is what a plan with a single price has
-- always been, now said out loud instead of assumed by the absence of any way
-- to say anything else.

INSERT INTO `plan_schedules` (`planId`, `label`, `sortOrder`, `active`)
    SELECT `id`, 'Monthly', 0, 1 FROM `platform_plans`;

INSERT INTO `plan_phases` (`scheduleId`, `seq`, `count`, `unit`, `price`, `repeats`)
    SELECT s.`id`, 1, 1, 'MONTH', p.`monthlyFee`, NULL
    FROM `plan_schedules` s
    JOIN `platform_plans` p ON p.`id` = s.`planId`
    WHERE s.`label` = 'Monthly';

-- Only where the plan is genuinely on the yearly shelf. A NULL yearly fee
-- means the owner never offered it; so does zero, which `soldYearly` has
-- always read as unset rather than as a free year.
INSERT INTO `plan_schedules` (`planId`, `label`, `sortOrder`, `active`)
    SELECT `id`, 'Yearly', 1, 1 FROM `platform_plans`
    WHERE `yearlyFee` IS NOT NULL AND `yearlyFee` > 0;

INSERT INTO `plan_phases` (`scheduleId`, `seq`, `count`, `unit`, `price`, `repeats`)
    SELECT s.`id`, 1, 1, 'YEAR', p.`yearlyFee`, NULL
    FROM `plan_schedules` s
    JOIN `platform_plans` p ON p.`id` = s.`planId`
    WHERE s.`label` = 'Yearly';

-- ── every existing subscription, on the schedule it is already on ─────────
--
-- `phaseStartedAt` is the subscription's own next period boundary, not its
-- start date. Anchoring there means the first period computed the new way ends
-- on exactly the date the old code would have produced — no customer's renewal
-- moves — while every period after it is measured from a fixed point instead of
-- chained off the one before, which is what stops the month-end slide.

UPDATE `subscriptions` sub
    JOIN `platform_plans` p ON p.`name` = sub.`plan`
    JOIN `plan_schedules` s ON s.`planId` = p.`id`
        AND s.`label` = CASE WHEN sub.`billingCycle` = 'YEARLY' THEN 'Yearly' ELSE 'Monthly' END
SET sub.`scheduleId` = s.`id`,
    sub.`phaseSeq` = 1,
    sub.`phaseDone` = 0,
    sub.`phaseStartedAt` = COALESCE(sub.`renewsAt`, sub.`trialEndsAt`, sub.`startedAt`);

-- A pending rhythm change becomes a pending schedule change.
UPDATE `subscriptions` sub
    JOIN `platform_plans` p ON p.`name` = COALESCE(sub.`pendingPlan`, sub.`plan`)
    JOIN `plan_schedules` s ON s.`planId` = p.`id`
        AND s.`label` = CASE WHEN sub.`pendingCycle` = 'YEARLY' THEN 'Yearly' ELSE 'Monthly' END
SET sub.`pendingScheduleId` = s.`id`
WHERE sub.`pendingCycle` IS NOT NULL;
