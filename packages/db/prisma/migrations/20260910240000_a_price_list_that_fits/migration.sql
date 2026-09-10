-- A platform setting can be longer than 255 characters.
--
-- Some settings are JSON: the email credit-pack price list and the option-list
-- defaults. `updateSettings` sliced to 255 before writing to fit this column,
-- so a list of more than about eight packs was cut mid-object. The parser then
-- fell back to the shipped prices — the platform selling at rates the owner
-- never set, while the console reported the save as successful.
ALTER TABLE `platform_settings` MODIFY COLUMN `value` TEXT NOT NULL;
