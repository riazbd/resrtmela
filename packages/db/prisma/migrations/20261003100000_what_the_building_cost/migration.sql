-- What the building cost.
--
-- Three questions the owner asked, which nothing in this product could
-- answer: who has put money in towards building the resort, what the money
-- has gone on, and what is left in hand.
--
-- One ledger, not two. The balance is a single SUM with a sign, so it cannot
-- be half-written the way a figure added up across two tables can. `kind`
-- says which side a line is on; `contributorId` is set on the way in and
-- `purposeId` on the way out.
--
-- Contributors and purposes are lists the resort owns rather than names
-- typed on every line, for the reason an agency's expense heads are a table:
-- "Karim", "karim" and "Karim bhai" are three people to a SUM and one person
-- to everybody else.
--
-- `DECIMAL(14,2)` where the rest of this schema uses `(10,2)`. Ten digits
-- stop just under ten crore, and a building is the one figure here that
-- reaches it.
--
-- Adds three tables and alters nothing that exists, so nothing running can
-- be broken by applying it.
CREATE TABLE `construction_contributors` (
  `id`        INTEGER      NOT NULL AUTO_INCREMENT,
  `resortId`  INTEGER      NOT NULL,
  `name`      VARCHAR(120) NOT NULL,
  `note`      VARCHAR(255) NULL,
  `active`    BOOLEAN      NOT NULL DEFAULT true,
  `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `construction_contributors_resortId_name_key`(`resortId`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `construction_purposes` (
  `id`        INTEGER      NOT NULL AUTO_INCREMENT,
  `resortId`  INTEGER      NOT NULL,
  `name`      VARCHAR(120) NOT NULL,
  `active`    BOOLEAN      NOT NULL DEFAULT true,
  `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `construction_purposes_resortId_name_key`(`resortId`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `construction_entries` (
  `id`            INTEGER        NOT NULL AUTO_INCREMENT,
  `resortId`      INTEGER        NOT NULL,
  `kind`          VARCHAR(3)     NOT NULL,
  `date`          DATE           NOT NULL,
  `amount`        DECIMAL(14, 2) NOT NULL,
  `contributorId` INTEGER        NULL,
  `purposeId`     INTEGER        NULL,
  `label`         VARCHAR(120)   NOT NULL,
  `paidTo`        VARCHAR(160)   NULL,
  `method`        VARCHAR(16)    NOT NULL DEFAULT 'CASH',
  `note`          VARCHAR(255)   NULL,
  `createdById`   INTEGER        NULL,
  `clientRef`     VARCHAR(64)    NULL,
  `createdAt`     DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `construction_entries_resortId_clientRef_key`(`resortId`, `clientRef`),
  INDEX `construction_entries_resortId_date_idx`(`resortId`, `date`),
  INDEX `construction_entries_contributorId_idx`(`contributorId`),
  INDEX `construction_entries_purposeId_idx`(`purposeId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `construction_contributors`
  ADD CONSTRAINT `construction_contributors_resortId_fkey`
  FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `construction_purposes`
  ADD CONSTRAINT `construction_purposes_resortId_fkey`
  FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `construction_entries`
  ADD CONSTRAINT `construction_entries_resortId_fkey`
  FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- The heading survives the line. Deleting a contributor or a purpose must
-- not delete what was paid — `label` is the name as it read on the day, so
-- the row still reads correctly with the link gone.
ALTER TABLE `construction_entries`
  ADD CONSTRAINT `construction_entries_contributorId_fkey`
  FOREIGN KEY (`contributorId`) REFERENCES `construction_contributors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `construction_entries`
  ADD CONSTRAINT `construction_entries_purposeId_fkey`
  FOREIGN KEY (`purposeId`) REFERENCES `construction_purposes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `construction_entries`
  ADD CONSTRAINT `construction_entries_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
