-- Who at the platform said the money had arrived, and how it came.
--
-- There is no payment gateway: a resort sends bKash or a bank transfer and a
-- person here confirms it. That person existed only in the audit log — the
-- platform's own trail, which the account holder cannot read — so the customer
-- whose money it was had no receipt naming anybody.
--
-- The method was worse than missing. `payDue` wrote it into the free-text
-- `note` as prose ("paid via bKash"), which overwrote whatever note was there
-- and made "how much came in by bKash last month" a string search.
--
-- All nullable and nothing backfilled. A due paid before today has no honest
-- answer to either question, and guessing CASH would put a method on money
-- nobody recorded one for.
ALTER TABLE `subscription_dues`
  ADD COLUMN `paidById` INTEGER NULL,
  ADD COLUMN `paidMethod` VARCHAR(24) NULL;

ALTER TABLE `platform_charges`
  ADD COLUMN `paidById` INTEGER NULL,
  ADD COLUMN `paidMethod` VARCHAR(24) NULL;

-- An agent handing 50,000 to somebody at the platform could not see, on their
-- own wallet, which person credited it.
ALTER TABLE `wallet_txns`
  ADD COLUMN `createdById` INTEGER NULL,
  ADD COLUMN `method` VARCHAR(24) NULL;

ALTER TABLE `subscription_dues`
  ADD CONSTRAINT `subscription_dues_paidById_fkey`
  FOREIGN KEY (`paidById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `platform_charges`
  ADD CONSTRAINT `platform_charges_paidById_fkey`
  FOREIGN KEY (`paidById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `wallet_txns`
  ADD CONSTRAINT `wallet_txns_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
