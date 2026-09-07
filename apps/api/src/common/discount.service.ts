import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DiscountService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** best active discount (absolute BDT) for a rent on a room type, at a date */
  async bestFor(resortId: number, roomTypeId: number | null, rent: number, at: Date): Promise<number> {
    if (rent <= 0) return 0;
    const offers = await this.prisma.discountOffer.findMany({
      where: {
        resortId,
        active: true,
        OR: [{ scope: "RESORT" }, { scope: "ROOM", roomTypeId: roomTypeId ?? -1 }],
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
