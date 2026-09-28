-- The running account between a resort and an agent.
--
-- Three changes, one idea: record what actually happened when an agent hands
-- money over. Until now the only thing the software offered was "the guest
-- paid", so a resort receiving 9,000 from an agent who kept 1,000 recorded the
-- 9,000 as the guest's payment — leaving the booking owing exactly the
-- commission, forever, and the Dues screen's per-agency total over by the
-- commission on every agency booking it counted.

-- 1. Who took the money from the guest. `receivedById` is whoever *recorded*
--    it, often somebody at the resort typing up a phone call; that is a
--    different person and the difference is the whole trade account.
ALTER TABLE `payments`
  ADD COLUMN `collectedByAgentId` INTEGER NULL,
  ADD INDEX `payments_collectedByAgentId_idx` (`collectedByAgentId`),
  ADD CONSTRAINT `payments_collectedByAgentId_fkey`
    FOREIGN KEY (`collectedByAgentId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. How much of the resort's money an agency may hold before it stops being
--    able to book. NULL is the default and means no limit, so nothing changes
--    for a resort that never asks for one.
ALTER TABLE `resort_agencies`
  ADD COLUMN `creditLimit` DECIMAL(14,2) NULL;

-- 3. The ledger. DECIMAL(14,2) rather than the (10,2) most of this schema uses:
--    a month-end settlement across forty stays reaches further than ten digits
--    comfortably allow.
CREATE TABLE `agent_account_entries` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT,
  `resortId`      INTEGER      NOT NULL,
  `agencyId`      INTEGER      NOT NULL,
  `kind`          VARCHAR(20)  NOT NULL,
  `amount`        DECIMAL(14,2) NOT NULL,
  `date`          DATE         NOT NULL,
  `bookingId`     INTEGER      NULL,
  `method`        VARCHAR(24)  NULL,
  `trxId`         VARCHAR(64)  NULL,
  `note`          VARCHAR(255) NULL,
  `rateKind`      VARCHAR(8)   NULL,
  `rate`          DECIMAL(10,2) NULL,
  `status`        VARCHAR(12)  NOT NULL DEFAULT 'CONFIRMED',
  `createdById`   INTEGER      NULL,
  `confirmedById` INTEGER      NULL,
  `confirmedAt`   DATETIME(3)  NULL,
  `clientRef`     VARCHAR(64)  NULL,
  `createdAt`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `agent_account_entries_resortId_clientRef_key` (`resortId`, `clientRef`),
  INDEX `agent_account_entries_resortId_agencyId_idx` (`resortId`, `agencyId`),
  INDEX `agent_account_entries_bookingId_idx` (`bookingId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- The resort and the agency own their lines: closing either closes the account.
ALTER TABLE `agent_account_entries`
  ADD CONSTRAINT `agent_account_entries_resortId_fkey`
    FOREIGN KEY (`resortId`) REFERENCES `resorts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  -- the agency, named by its owner's user id: the convention every other
  -- agency-owned table here already uses
  ADD CONSTRAINT `agent_account_entries_agencyId_fkey`
    FOREIGN KEY (`agencyId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  -- A deleted booking must not take the commission on it out of the month's
  -- figures: the line stays and stops naming a stay.
  ADD CONSTRAINT `agent_account_entries_bookingId_fkey`
    FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `agent_account_entries_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `agent_account_entries_confirmedById_fkey`
    FOREIGN KEY (`confirmedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
