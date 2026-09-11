-- Every account has an email and a phone, so every account can get back in.
--
-- The owner's ruling of 2026-09-11: every user has both, signs in with either,
-- and can reset a forgotten password - and a reset is a link sent by email.
-- Self-signup kept only a phone and an invited agent only an email, so the
-- owner who signed up alone was the one person a reset could never reach.
-- Both columns become required, in three steps, in this order.
--
-- 1. Phones are rewritten to the form login looks them up by.
--    `loginWithPassword` reads a typed phone through `normalizePhone`
--    (apps/api/src/common/dates.ts), but the resort and agency paths used to
--    store bare digits: a colleague added as 01712345678 was kept as
--    01712345678, login asked for 8801712345678, and nobody was found. This is
--    the same rule, for Bangladesh, in SQL:
--      digits := the value with every non-digit removed
--      starts 880, 13 or more digits  -> the first 13
--      starts 880, fewer              -> as is
--      0 followed by 10 digits        -> 880 and the 10
--      exactly 10 digits              -> 880 and the 10
--      anything else                  -> the digits, as they are
--    A row is left alone when any other row has the same canonical form -
--    whether that row is already canonical or is another spelling of the same
--    number - so the unique index can never stop the migration; those rows
--    keep their spelling and are counted on the way through, not merged. A
--    value with no digits at all is not a phone and is left alone too.
--    The canonical form is spelled out twice, once per row and once per
--    group, rather than in a WITH clause, to stay inside the UPDATE syntax
--    that MySQL (local) and MariaDB (production) both accept. The outer
--    derived table is grouped so that it is materialised before the UPDATE
--    reads `users`, which is what lets a table be updated from itself.
--
-- 2. The gaps get placeholders nobody can mistake for contact details.
--    `.invalid` is reserved and never delivers. `placeholder-<id>` is not a
--    phone number: `normalizePhone` turns anything typed at the login box into
--    digits, which can never equal it. A resort replaces both from its users
--    screen.
--
-- 3. Both columns become NOT NULL. Each keeps its type and its unique index
--    (MODIFY leaves an index alone). No COLLATE is named: a MODIFY without one
--    takes the table's default, and on every database this was checked
--    against the columns already carry exactly that (utf8mb4_unicode_ci), so
--    naming one here could only impose it on a table built with another.
--
-- Creates and drops nothing, so baseline-db.mjs classes it data-only and runs
-- it. Running it twice changes nothing: step 1 skips placeholders and values
-- already canonical, and step 2 only fills what is NULL or blank.

UPDATE `users` AS u
JOIN (
  SELECT one_row.id, one_row.canon
  FROM (
    SELECT id, phone,
      CASE
        WHEN d LIKE '880%' AND CHAR_LENGTH(d) >= 13 THEN LEFT(d, 13)
        WHEN d LIKE '880%' THEN d
        WHEN CHAR_LENGTH(d) = 11 AND d LIKE '0%' THEN CONCAT('880', SUBSTRING(d, 2))
        WHEN CHAR_LENGTH(d) = 10 THEN CONCAT('880', d)
        ELSE d
      END AS canon
    FROM (
      SELECT id, phone, REGEXP_REPLACE(phone, '[^0-9]', '') AS d
      FROM `users`
      WHERE phone IS NOT NULL AND TRIM(phone) <> '' AND phone NOT LIKE 'placeholder-%'
    ) AS digits
  ) AS one_row
  JOIN (
    SELECT canon, COUNT(*) AS holders
    FROM (
      SELECT
        CASE
          WHEN d LIKE '880%' AND CHAR_LENGTH(d) >= 13 THEN LEFT(d, 13)
          WHEN d LIKE '880%' THEN d
          WHEN CHAR_LENGTH(d) = 11 AND d LIKE '0%' THEN CONCAT('880', SUBSTRING(d, 2))
          WHEN CHAR_LENGTH(d) = 10 THEN CONCAT('880', d)
          ELSE d
        END AS canon
      FROM (
        SELECT REGEXP_REPLACE(phone, '[^0-9]', '') AS d
        FROM `users`
        WHERE phone IS NOT NULL AND TRIM(phone) <> '' AND phone NOT LIKE 'placeholder-%'
      ) AS digits
    ) AS every_row
    GROUP BY canon
  ) AS by_number ON by_number.canon = one_row.canon
  WHERE one_row.canon <> one_row.phone AND one_row.canon <> '' AND by_number.holders = 1
  GROUP BY one_row.id, one_row.canon
) AS fix ON fix.id = u.id
SET u.phone = fix.canon;

UPDATE `users` SET `email` = CONCAT('user-', `id`, '@placeholder.invalid') WHERE `email` IS NULL OR TRIM(`email`) = '';

UPDATE `users` SET `phone` = CONCAT('placeholder-', `id`) WHERE `phone` IS NULL OR TRIM(`phone`) = '';

ALTER TABLE `users` MODIFY `phone` VARCHAR(32) NOT NULL, MODIFY `email` VARCHAR(191) NOT NULL;
