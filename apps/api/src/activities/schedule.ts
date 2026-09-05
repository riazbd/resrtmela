/** Pure recurrence helpers — unit tested. */

export interface ScheduleRow {
  weekday: number; // 0 = Sunday .. 6 = Saturday
  startTime: string; // "10:00"
  endTime: string;
  capacity: number;
  active?: boolean;
}

export interface ExpandedSlot {
  date: Date;
  row: ScheduleRow;
}

/** Every (date, schedule) pair in [from, to) matching weekday, active only. */
export function expandSchedules(
  schedules: ScheduleRow[],
  from: Date,
  to: Date,
): ExpandedSlot[] {
  const out: ExpandedSlot[] = [];
  const d = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  while (d < to) {
    for (const row of schedules) {
      if (row.active !== false && row.weekday === d.getUTCDay()) {
        out.push({ date: new Date(d.getTime()), row });
      }
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Combine a date + "HH:MM" into a UTC datetime (resort clock treated as UTC). */
export function slotDateTime(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map((x) => Number(x) || 0);
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      h ?? 0,
      m ?? 0,
    ),
  );
}

/** Seats left given a slot row. */
export function remainingSeats(capacity: number, bookedCount: number): number {
  return Math.max(0, capacity - bookedCount);
}
