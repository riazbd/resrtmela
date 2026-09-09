import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Standing offers, at the three scopes an owner actually thinks in.
 *
 * `ROOM` used to mean a room *type*, which cannot express the case an owner
 * asks for first: one particular room is noisy, or faces the generator, or is
 * the last one left on a slow Tuesday, so it goes cheaper than its identical
 * neighbour. All three scopes now exist and mean what they say.
 */
@Injectable()
export class DiscountService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * The best active discount (absolute, in the resort's currency) for a rent,
   * at a date, on a room.
   *
   * Where several offers apply, the guest gets the largest. An owner who sets
   * a room-level offer on top of a resort-wide one means "this room, cheaper" —
   * not "average the two" — and a guest comparing prices will find the better
   * number anyway.
   */
  async bestFor(
    resortId: number,
    roomTypeId: number | null,
    rent: number,
    at: Date,
    roomId?: number | null,
  ): Promise<number> {
    if (rent <= 0) return 0;
    const offers = await this.prisma.discountOffer.findMany({
      where: {
        resortId,
        active: true,
        OR: [
          { scope: "RESORT" },
          { scope: "ROOM_TYPE", roomTypeId: roomTypeId ?? -1 },
          { scope: "ROOM", roomId: roomId ?? -1 },
        ],
      },
    });
    let best = 0;
    for (const o of offers) {
      if (o.validFrom && o.validFrom > at) continue;
      if (o.validTo && o.validTo < at) continue;
      const off = o.kind === "PERCENT" ? Math.round((Number(o.value) / 100) * rent) : Number(o.value);
      if (off > best) best = off;
    }
    return Math.min(best, rent);
  }
}
