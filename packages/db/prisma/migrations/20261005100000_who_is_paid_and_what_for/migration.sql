-- Who is paid, from when, and what a month is worth.
--
-- Payroll was a list of names and salaries with nothing tying it to anything:
-- not to the people who sign in to the app, not to the day somebody started or
-- left, and with no way to add a bonus or take something off. The owner
-- (2026-10-02): "kar sathe kar connection, ke payroll e ashbe, ke ashbe na, ki
-- pabe ki pabe na, kichui bujha jay na."
--
-- 1. `employees.userId`: the app login this person uses, if any.
-- 2. `employees.leftDate`: off payroll after this day. Joining and leaving
--    part-way through a month pay that month for the days.
-- 3. `payroll_adjustments`: a bonus or a deduction against a month. Not a
--    payment: the P&L counts money that left, and this is not that.
--
-- Adds two nullable columns and one table, so nothing running is broken by
-- applying it.
ALTER TABLE `employees`
  ADD COLUMN `leftDate` DATE NULL,
  ADD COLUMN `userId` INTEGER NULL,
  ADD INDEX `employees_userId_idx` (`userId`),
  ADD CONSTRAINT `employees_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `payroll_adjustments` (
  `id`          INTEGER       NOT NULL AUTO_INCREMENT,
  `resortId`    INTEGER       NULL,
  `agencyId`    INTEGER       NULL,
  `employeeId`  INTEGER       NOT NULL,
  `month`       VARCHAR(7)    NOT NULL,
  `kind`        VARCHAR(12)   NOT NULL,
  `amount`      DECIMAL(10,2) NOT NULL,
  `note`        VARCHAR(255)  NULL,
  `createdAt`   DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdById` INTEGER       NULL,

  INDEX `payroll_adjustments_employeeId_month_idx`(`employeeId`, `month`),
  INDEX `payroll_adjustments_resortId_month_idx`(`resortId`, `month`),
  INDEX `payroll_adjustments_agencyId_month_idx`(`agencyId`, `month`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `payroll_adjustments`
  ADD CONSTRAINT `payroll_adjustments_resortId_fkey`
    FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `payroll_adjustments_agencyId_fkey`
    FOREIGN KEY (`agencyId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `payroll_adjustments_employeeId_fkey`
    FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
