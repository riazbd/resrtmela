/**
 * What a migration would create, read from its SQL.
 *
 * Used by baseline-db.mjs to decide whether a database already has everything
 * a pending migration would add — which is the situation any database built by
 * `db push` before migrations existed is in, and the reason `migrate deploy`
 * dies on it with "Duplicate column name".
 *
 * Deliberately narrow: it understands the handful of statement shapes Prisma's
 * own migration generator emits, and reports nothing for anything else. A
 * migration it cannot read is left pending, which is the safe answer — the
 * tool never marks something applied on a guess.
 */

/** Strips `-- line comments` so an explanation is never read as SQL. */
function withoutComments(sql) {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

const unquote = (name) => name.replace(/[`"']/g, "").trim();

/**
 * @param {string} sql
 * @returns {{kind: "table"|"column"|"index", table: string, name?: string}[]}
 */
export function objectsCreatedBy(sql) {
  const text = withoutComments(sql);
  const found = [];

  for (const m of text.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([\w$]+)[`"]?/gi)) {
    found.push({ kind: "table", table: unquote(m[1]) });
  }

  for (const m of text.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+[`"]?([\w$]+)[`"]?\s+ON\s+[`"]?([\w$]+)[`"]?/gi)) {
    found.push({ kind: "index", table: unquote(m[2]), name: unquote(m[1]) });
  }

  // ALTER TABLE x ADD COLUMN a ..., ADD COLUMN b ...;  — one statement, several columns
  for (const stmt of text.split(";")) {
    const table = /ALTER\s+TABLE\s+[`"]?([\w$]+)[`"]?/i.exec(stmt);
    if (!table) continue;
    for (const m of stmt.matchAll(/ADD\s+COLUMN\s+[`"]?([\w$]+)[`"]?/gi)) {
      found.push({ kind: "column", table: unquote(table[1]), name: unquote(m[1]) });
    }
  }

  return found;
}
