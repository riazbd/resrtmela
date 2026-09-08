-- Tenant data export is new, so no existing role holds the permission and
-- nobody but a resort admin (who bypasses the matrix) could use it.
--
-- Whoever was trusted to bulk-import a spreadsheet is trusted with the same
-- data going the other way, so import.run is the honest grandfather rule.
-- Anyone else gets it the normal way: the owner ticks a box.

UPDATE `roles`
SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'export.run')
WHERE JSON_SEARCH(`permissions`, 'one', 'import.run') IS NOT NULL
  AND JSON_SEARCH(`permissions`, 'one', 'export.run') IS NULL;
