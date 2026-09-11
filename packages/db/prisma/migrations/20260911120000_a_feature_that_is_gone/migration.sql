-- `public_api` sold access to the resort-website `/v1` API. That API was
-- removed in an earlier task on this branch; the key-management endpoints and
-- the `api_keys` table stayed (a future integration may want them back), but
-- nothing implements the feature any more, so no plan may keep offering it —
-- `isPlanFeature` would reject it on the next edit of any plan that lists it,
-- for a reason nobody reading the panel could act on.
--
-- `features` is declared JSON on MySQL (see migration
-- 20260910260000_a_plan_is_a_list_of_features) but MariaDB has no native JSON
-- type and stores the column as `longtext` — the value on disk is the same
-- text either way. This is a by-value edit, not a string edit, because
-- `JSON_ARRAY(...)` (how every existing row was written) serialises with a
-- ", " separator on both engines: a plan holding `["a", "public_api"]` is text
-- `["a", "public_api"]`, and a naive `REPLACE(..., '"public_api",', '')` or
-- `REPLACE(..., ',"public_api"', '')` matches neither comma variant, leaving
-- `["a", ]` — invalid JSON. `JSON_SEARCH` + `JSON_REMOVE` edit the value by
-- its position in the array instead of by surrounding punctuation, so the
-- separator style never matters. Both functions exist on MySQL 5.7+ and on
-- MariaDB (which implements the MySQL JSON function surface over its longtext
-- storage) without a `CAST(... AS JSON)`, which is a syntax error on MariaDB.
--
-- `JSON_SEARCH(doc, 'one', 'public_api')` returns the path to the first match
-- (e.g. '$[1]') or NULL if there is none; `JSON_REMOVE` deletes that one path.
-- Nothing in `platform.service.ts` deduplicates a plan's `features` before
-- saving it (validation only checks every key is a known feature), so a plan
-- could in principle list `public_api` twice. Running the same guarded
-- statement a second time removes a second occurrence if there was one, and
-- is a no-op (the WHERE clause finds nothing to search) if there was not —
-- safe either way, and far simpler than a recursive removal.
UPDATE `platform_plans`
SET `features` = JSON_REMOVE(`features`, JSON_UNQUOTE(JSON_SEARCH(`features`, 'one', 'public_api')))
WHERE JSON_SEARCH(`features`, 'one', 'public_api') IS NOT NULL;

UPDATE `platform_plans`
SET `features` = JSON_REMOVE(`features`, JSON_UNQUOTE(JSON_SEARCH(`features`, 'one', 'public_api')))
WHERE JSON_SEARCH(`features`, 'one', 'public_api') IS NOT NULL;
