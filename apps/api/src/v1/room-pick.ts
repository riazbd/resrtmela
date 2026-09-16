/**
 * Choosing a room for a caller who may only name a kind of room.
 *
 * Shared by a resort's API and an agency's: both book "a deluxe", never "room
 * 102", because an API that takes a room id lets a stranger enumerate the
 * inventory one number at a time. One copy, so the two cannot pick differently.
 */
import { roomTypeKeys } from "@rh/shared";
import type { PrismaService } from "../prisma/prisma.service";
import { badRequest } from "../common/rbac";
import { LIVE_STATES } from "../bookings/booking-state";

/** The kind of room a caller named, by the handle the published view gives it. */
export async function roomTypeByKey(
  prisma: PrismaService,
  resortId: number,
  wanted: string,
): Promise<{ id: number; name: string }> {
  const types = await prisma.roomType.findMany({
    where: { resortId, active: true },
    orderBy: { id: "asc" },
    select: { id: true, name: true },
  });
  const keys = roomTypeKeys(types.map((t) => t.name));
  const i = keys.indexOf(String(wanted ?? "").trim().toLowerCase());
  if (i === -1) {
    throw badRequest(`This resort has no room type called "${wanted}". The kinds are: ${keys.join(", ")}.`);
  }
  return types[i]!;
}

/**
 * A room of that kind with none of those nights taken.
 *
 * The same rule the calendar runs. The booking service checks again on the way
 * in, and its `UNIQUE` index is the thing that actually decides.
 */
export async function freeRoomOfType(
  prisma: PrismaService,
  resortId: number,
  roomTypeId: number,
  checkIn: string,
  checkOut: string,
): Promise<number | null> {
  const from = new Date(`${checkIn}T00:00:00.000Z`);
  const to = new Date(`${checkOut}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw badRequest("Those are not dates.");
  if (to <= from) throw badRequest("checkOut must be after checkIn.");

  const rooms = await prisma.room.findMany({
    where: { resortId, roomTypeId, status: "ACTIVE", deletedAt: null },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const busy = await prisma.bookingNight.findMany({
    where: {
      night: { gte: from, lt: to },
      room: { resortId, roomTypeId },
      item: { booking: { state: { in: LIVE_STATES }, deletedAt: null } },
    },
    select: { roomId: true },
    distinct: ["roomId"],
  });
  const taken = new Set(busy.map((b) => b.roomId));
  return rooms.find((r) => !taken.has(r.id))?.id ?? null;
}
