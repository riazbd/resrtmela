-- Whether an agent sees whose booking occupies a night, or only that it is taken.
-- Closed by default: an agency is an outside business, often a competitor of the
-- next agency along, and the resort's customer list is not the agency's to keep.
ALTER TABLE `resorts` ADD COLUMN `showGuestNamesToAgents` BOOLEAN NOT NULL DEFAULT false;
