-- Somebody's hand takes the money, and that hand has a name.
--
-- There is no payment gateway here: every taka is handed to a person who then
-- tells the software it arrived. A resort's bookings have always recorded that
-- person on the payment row. An agency's own invoices recorded nothing but a
-- larger number in `sales_docs.amountPaid`, so an agency with four staff
-- taking cash could not say which of them took 20,000, when, or how.
--
-- Deliberately the same shape as `payments`, down to the clientRef guard that
-- stops a replayed write becoming a second receipt. Two ledgers for the same
-- act should not need two vocabularies.
--
-- Nothing is backfilled. An invoice part-paid before this table existed keeps
-- its total and no lines: inventing lines would put a name and a method on
-- money nobody recorded either for.
CREATE TABLE `sales_payments` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT,
  `salesDocId`   INTEGER      NOT NULL,
  `amount`       DECIMAL(10, 2) NOT NULL,
  `method`       VARCHAR(24)  NOT NULL DEFAULT 'CASH',
  `receivedById` INTEGER      NULL,
  `receivedAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `note`         VARCHAR(255) NULL,
  `clientRef`    VARCHAR(64)  NULL,

  UNIQUE INDEX `sales_payments_salesDocId_clientRef_key`(`salesDocId`, `clientRef`),
  INDEX `sales_payments_salesDocId_idx`(`salesDocId`),
  INDEX `sales_payments_receivedAt_idx`(`receivedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `sales_payments`
  ADD CONSTRAINT `sales_payments_salesDocId_fkey`
  FOREIGN KEY (`salesDocId`) REFERENCES `sales_docs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `sales_payments`
  ADD CONSTRAINT `sales_payments_receivedById_fkey`
  FOREIGN KEY (`receivedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
