-- A locked-out staff member needs a way back in that does not depend on OTP,
-- which a later task removes. The token itself is never stored — only its
-- sha256 — so a stolen database backup cannot be used to mint a working link.
CREATE TABLE `password_resets` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `userId` INT NOT NULL,
  `tokenHash` VARCHAR(64) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `password_resets_tokenHash_key`(`tokenHash`),
  INDEX `password_resets_userId_idx`(`userId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `password_resets_userId_fkey` FOREIGN KEY (`userId`)
    REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;
