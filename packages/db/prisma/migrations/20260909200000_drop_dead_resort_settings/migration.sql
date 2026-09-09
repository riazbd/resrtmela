-- resorts.settings was a JSON column no code ever read or wrote.
--
-- A dead column with a name like "settings" does not stay dead: it becomes
-- the junk drawer the next feature reaches for, and then tenant
-- configuration lives somewhere nothing can query, index or migrate. Real
-- per-resort settings are columns; real platform policy is platform_settings.
--
-- Nothing is lost: no code path in the history of this repository ever
-- assigned to it.

-- AlterTable
ALTER TABLE `resorts` DROP COLUMN `settings`;

