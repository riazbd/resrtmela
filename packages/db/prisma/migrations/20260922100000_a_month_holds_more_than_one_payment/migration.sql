-- A month of payroll holds as many payments as it took.
--
-- `payroll_payments` had a unique index on (employeeId, month), so an employee
-- could be paid once per month and that payment was the whole salary. Real
-- payroll at a resort does not work that way: a cook on 15,000 takes 2,000 on
-- the 8th and 5,000 on the 20th, and what is handed over at the end of the
-- month is the 8,000 that is left. The second payment was refused with
-- "already paid for 2026-09 — undo it first", which is the index speaking.
--
-- `kind` says which of the two things a payment was. It defaults to SALARY
-- because every row that exists today was the month's salary, written back
-- when a month could hold exactly one; reading them as anything else would
-- rewrite history at the moment of the upgrade.
--
-- The replacement index is created BEFORE the unique one is dropped. The
-- foreign key on `employeeId` leans on whichever index leads with that column,
-- and MySQL refuses to drop the last one standing: "Cannot drop index
-- 'payroll_payments_employeeId_month_key': needed in a foreign key
-- constraint". With the ordinary index already there, the drop is allowed and
-- the constraint never goes unindexed for an instant.
--
-- Nothing is deleted and no amount is touched.
ALTER TABLE `payroll_payments` ADD COLUMN `kind` VARCHAR(12) NOT NULL DEFAULT 'SALARY';

CREATE INDEX `payroll_payments_employeeId_month_idx` ON `payroll_payments`(`employeeId`, `month`);

DROP INDEX `payroll_payments_employeeId_month_key` ON `payroll_payments`;
