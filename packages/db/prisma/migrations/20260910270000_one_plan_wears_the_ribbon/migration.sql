-- Which plan the pricing page recommends is a decision, so the owner makes it.
--
-- The "Most popular" ribbon was pinned to `i === 1` in the homepage — the second
-- card on the page. With three plans that happened to land on Growth and looked
-- deliberate. With a fourth it lands wherever the sort order puts it, and the
-- platform recommends a plan nobody chose to recommend.
--
-- One at a time is enforced in the service rather than by a unique index: the
-- rule is "at most one true", which a UNIQUE column cannot express without
-- storing NULLs for false and inviting a row that means neither.

ALTER TABLE `platform_plans` ADD COLUMN `highlight` BOOLEAN NOT NULL DEFAULT FALSE;

-- Growth is where the ribbon has been sitting, so nothing on the page moves.
UPDATE `platform_plans` SET `highlight` = TRUE WHERE `name` = 'GROWTH';
