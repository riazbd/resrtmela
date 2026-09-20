-- A phone that has asked to be told things.
--
-- The only schema change the mobile project makes. It adds a table and
-- alters no existing column, so nothing that is running can be broken by
-- applying it; the risk is the usual one of touching a live business at
-- all, which is why it goes out with a verified backup.
--
-- `token` is unique because the same device signing in as a second person
-- must move the row, not add one — two rows would keep pushing a resort's
-- bookings at whoever had the phone before.
CREATE TABLE `device_tokens` (
  `id`         INTEGER      NOT NULL AUTO_INCREMENT,
  `userId`     INTEGER      NOT NULL,
  `token`      VARCHAR(255) NOT NULL,
  `platform`   VARCHAR(16)  NOT NULL,
  `lastSeenAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `device_tokens_token_key`(`token`),
  INDEX `device_tokens_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `device_tokens`
  ADD CONSTRAINT `device_tokens_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
