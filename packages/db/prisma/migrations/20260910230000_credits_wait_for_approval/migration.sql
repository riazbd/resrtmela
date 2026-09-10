-- Buying email credits becomes a request the platform decides on.
--
-- Pressing a pack button used to grant the credits and raise a billable charge
-- in the same call: a misclick on the largest pack was a charge nobody at the
-- platform had agreed to. The order waits here; approval is the moment the
-- credits and the charge both come into being.
CREATE TABLE `email_credit_orders` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT,
  `userId`      INTEGER      NOT NULL,
  `resortId`    INTEGER      NOT NULL,
  `credits`     INTEGER      NOT NULL,
  `price`       DECIMAL(10, 2) NOT NULL,
  `status`      VARCHAR(16)  NOT NULL DEFAULT 'PENDING',
  `clientRef`   VARCHAR(64)  NULL,
  `note`        VARCHAR(255) NULL,
  `decidedById` INTEGER      NULL,
  `decidedAt`   DATETIME(3)  NULL,
  `createdAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `email_credit_orders_resortId_clientRef_key`(`resortId`, `clientRef`),
  INDEX `email_credit_orders_status_createdAt_idx`(`status`, `createdAt`),
  INDEX `email_credit_orders_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `email_credit_orders`
  ADD CONSTRAINT `email_credit_orders_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `email_credit_orders_resortId_fkey`
    FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
