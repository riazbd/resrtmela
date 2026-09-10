-- Expense categories become a list the resort owns, and it keeps the ones it
-- has been using.
--
-- They used to be derived with a `groupBy` over the expense rows themselves, so
-- the "list" was a memory of whatever had been typed: nothing could be added
-- before it was spent on, nothing renamed, and "Salaries" / "salary" / "Salery"
-- were three categories for ever — three rows in every report that groups by
-- category. EXPENSE_CATEGORY is the fourth entry in the options registry now,
-- and `expenses.create` refuses a category that is not on the list.
--
-- Which is exactly why this migration exists. A resort that has spent a year
-- filing costs under its own words would otherwise open the screen and find
-- every one of them missing from the picker. Each resort's existing categories
-- are carried onto its list, keeping the code it already stores so no expense
-- row has to be rewritten, and sorted after the seeded defaults.
--
-- `INSERT IGNORE` rather than a conflict clause: the unique key is
-- (resortId, list, code), and a resort whose typed category happens to match a
-- default keeps the default's label.

INSERT IGNORE INTO `resort_options` (`resortId`, `list`, `code`, `label`, `sortOrder`, `active`, `createdAt`, `updatedAt`)
SELECT
  e.`resortId`,
  'EXPENSE_CATEGORY',
  LEFT(e.`category`, 32),
  LEFT(e.`category`, 60),
  100,
  1,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `expenses` e
WHERE e.`category` IS NOT NULL
  AND e.`category` <> ''
  AND e.`resortId` IS NOT NULL
GROUP BY e.`resortId`, LEFT(e.`category`, 32);
