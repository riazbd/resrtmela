-- A queued message now records whose it is and what was actually sent.
--
-- resortId: the dispatcher needs it to pick the resort own wording and to
-- send under the resort own name. The column was declared in the enqueue
-- interface and never written -- so every message went out as the platform.
--
-- renderedText: "what did the guest actually receive" had no answer. With a
-- tenant able to edit the wording, it needs one.

-- AlterTable
ALTER TABLE `notification_jobs` ADD COLUMN `renderedText` TEXT NULL,
    ADD COLUMN `resortId` INTEGER NULL;

