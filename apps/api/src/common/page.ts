/**
 * Paging for list endpoints.
 *
 * Several lists used to stop at a hard `take:` and return a bare array, so a
 * resort with 431 guests saw 200 and was told nothing. A list that quietly
 * stops at its cap reports a number that is not true, which is worse than
 * refusing to answer.
 *
 * Every paged list therefore returns the true `total` alongside its rows, and
 * says whether anything was left out.
 */

export interface PageRequest {
  skip?: number;
  take?: number;
}

export interface Page<T> {
  rows: T[];
  total: number;
  skip: number;
  take: number;
  /** true when rows beyond this page exist */
  truncated: boolean;
}

/** Clamped skip/take, so a caller cannot ask for the whole table. */
export function pageArgs(req: PageRequest | undefined, defaultTake: number, maxTake = 500) {
  const take = Math.min(Math.max(1, Math.floor(req?.take ?? defaultTake)), maxTake);
  const skip = Math.max(0, Math.floor(req?.skip ?? 0));
  return { skip, take };
}

export function toPage<T>(rows: T[], total: number, skip: number, take: number): Page<T> {
  return { rows, total, skip, take, truncated: skip + rows.length < total };
}
