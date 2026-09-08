-- "activities.view" / "activities.delete" meant the audit log, not the bookable
-- activity catalogue, while the Settings screen labelled them "View activities"
-- and "Delete activities". Two different powers behind one word.
--
-- The keys are split, so existing custom roles must be rewritten: validPermissions()
-- silently drops keys it does not recognise, and an unmigrated role would quietly
-- lose access instead of failing loudly.
--
-- activities.delete only ever gated the audit log, so it becomes auditlog.delete.
-- activities.view stays (it still means "see the activities screen") and any role
-- that held it also gains auditlog.view, which is what it granted in practice.

UPDATE `roles`
SET `permissions` = CAST(
  REPLACE(CAST(`permissions` AS CHAR), '"activities.delete"', '"auditlog.delete"') AS JSON
)
WHERE JSON_SEARCH(`permissions`, 'one', 'activities.delete') IS NOT NULL;

UPDATE `roles`
SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'auditlog.view')
WHERE JSON_SEARCH(`permissions`, 'one', 'activities.view') IS NOT NULL
  AND JSON_SEARCH(`permissions`, 'one', 'auditlog.view') IS NULL;

-- Roles that could manage rooms and rates were, in practice, the ones allowed to
-- manage the activity catalogue too, since both were gated on the fixed manager
-- role. Preserve that rather than silently taking it away.
UPDATE `roles`
SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'activities.manage')
WHERE JSON_SEARCH(`permissions`, 'one', 'rooms.manage') IS NOT NULL
  AND JSON_SEARCH(`permissions`, 'one', 'activities.manage') IS NULL;
