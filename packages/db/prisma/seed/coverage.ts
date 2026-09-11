/**
 * Did the demo data actually fill the system?
 *
 * Two questions, asked of the database rather than of the seed: is any table
 * empty, and is any column empty in every row. The second is the one that
 * matters on a screen — a column nothing ever sets looks like a feature that
 * does not work, and that is exactly what a demo must not do.
 */
import type { PrismaClient } from "../../src";

interface Col {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  IS_NULLABLE: string;
}

/**
 * Columns left empty on purpose, and why.
 *
 * A retired column has nowhere honest to put a value: filling it would mean
 * seeding something the product no longer does, which is worse in a demo than
 * an empty column nobody sees.
 */
export const EXPECTED_EMPTY: Record<string, string> = {
  "user_resorts.commissionRate":
    "retired: the per-agent rate, replaced by the resort's one rate — and an agency holds no row here at all now",
};

export async function reportCoverage(prisma: PrismaClient) {
  const cols = await prisma.$queryRawUnsafe<Col[]>(
    `SELECT TABLE_NAME, COLUMN_NAME, IS_NULLABLE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> '_prisma_migrations'
      ORDER BY TABLE_NAME, ORDINAL_POSITION`,
  );

  const tables = [...new Set(cols.map((c) => c.TABLE_NAME))];
  const counts = new Map<string, number>();
  for (const t of tables) {
    const [row] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM \`${t}\``);
    counts.set(t, Number(row?.n ?? 0));
  }

  const emptyTables = tables.filter((t) => (counts.get(t) ?? 0) === 0);
  const emptyColumns: string[] = [];
  for (const c of cols) {
    if ((counts.get(c.TABLE_NAME) ?? 0) === 0) continue;
    const [row] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(\`${c.COLUMN_NAME}\`) AS n FROM \`${c.TABLE_NAME}\``,
    );
    if (Number(row?.n ?? 0) === 0) emptyColumns.push(`${c.TABLE_NAME}.${c.COLUMN_NAME}`);
  }

  return { counts, tables, emptyTables, emptyColumns };
}

export function printCoverage(result: Awaited<ReturnType<typeof reportCoverage>>) {
  const { counts, tables, emptyTables, emptyColumns } = result;
  const width = Math.max(...tables.map((t) => t.length));
  console.log("\nRows by table");
  for (const t of tables) console.log(`  ${t.padEnd(width)}  ${String(counts.get(t) ?? 0).padStart(6)}`);

  if (emptyTables.length) console.log(`\n⚠ empty tables (${emptyTables.length}): ${emptyTables.join(", ")}`);
  else console.log("\n✓ every table has rows");

  const unexpected = emptyColumns.filter((c) => !(c in EXPECTED_EMPTY));
  const onPurpose = emptyColumns.filter((c) => c in EXPECTED_EMPTY);
  if (unexpected.length) {
    console.log(`⚠ columns with no value in any row (${unexpected.length}):`);
    for (const c of unexpected) console.log(`    ${c}`);
  } else {
    console.log("✓ every column has a value somewhere, but for the ones left empty on purpose");
  }
  for (const c of onPurpose) console.log(`  · ${c} — ${EXPECTED_EMPTY[c]}`);
}
