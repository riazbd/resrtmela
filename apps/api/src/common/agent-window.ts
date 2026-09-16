/**
 * How far ahead a resort lets agencies book — one rule, asked by every door an
 * agency comes through: the quote, the booking, moving a booking, the room
 * search and the calendar.
 *
 * Every night of the stay has to fall inside the window, so the check-out may
 * land on the window's last day but not after it. "Today" is the resort's,
 * not the server's: after 18:00 in Dhaka the two are different days.
 */
import type { PrismaService } from "../prisma/prisma.service";
import type { Prisma } from "@rh/db";
import { todayIn } from "./dates";

const DAY = 86_400_000;

/** The last check-out an agency may book, or null when the resort set no limit. */
export function bookableUntil(resort: { timezone: string; agentBookingWindowDays: number | null }, now = new Date()): Date | null {
  if (resort.agentBookingWindowDays == null) return null;
  return new Date(todayIn(resort.timezone, now).getTime() + resort.agentBookingWindowDays * DAY);
}

/** Refuses a stay an agency may not book yet, saying how far ahead it may. */
export async function assertWithinAgentWindow(
  prisma: PrismaService | Prisma.TransactionClient,
  resortId: number,
  checkOut: Date,
): Promise<void> {
  const resort = await prisma.resort.findUniqueOrThrow({
    where: { id: resortId },
    select: { timezone: true, agentBookingWindowDays: true },
  });
  const until = bookableUntil(resort);
  if (until == null || checkOut.getTime() <= until.getTime()) return;
  const lastDay = until.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  throw Object.assign(
    new Error(
      `Agents can book up to ${resort.agentBookingWindowDays} days ahead here — stays checking out by ${lastDay}. Ask the resort for later dates.`,
    ),
    { status: 403 },
  );
}
