/**
 * Seed: Sky Eco Resort demo tenant matching the manager's live sheet.
 * Idempotent (safe to re-run). Dates are UTC-midnight — same convention as the API.
 * Run: pnpm db:seed
 */
import { PrismaClient, Role, RoomStatus, BookingSource, BookingState } from "../src";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function utcToday(offsetDays = 0): Date {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

async function main() {
  const passwordHash = await bcrypt.hash("Password123!", 12);

  const tenant = await prisma.tenant.upsert({
    where: { slug: "sky-eco" },
    update: {},
    create: { name: "Sky Eco Group", slug: "sky-eco" },
  });

  let resort = await prisma.resort.findFirst({ where: { tenantId: tenant.id } });
  if (!resort) {
    resort = await prisma.resort.create({
      data: {
        tenantId: tenant.id,
        name: "Sky Eco Resort",
        location: "Sylhet, Bangladesh",
        showRatesToAgents: true,
      },
    });
  }

  let standardType = await prisma.roomType.findFirst({
    where: { resortId: resort.id, name: "Standard Garden View" },
  });
  if (!standardType) {
    standardType = await prisma.roomType.create({
      data: {
        resortId: resort.id,
        name: "Standard Garden View",
        maxAdults: 2,
        maxChildren: 1,
        amenities: ["AC", "WiFi", "Breakfast"],
      },
    });
  }

  let familyType = await prisma.roomType.findFirst({
    where: { resortId: resort.id, name: "Family Suite" },
  });
  if (!familyType) {
    familyType = await prisma.roomType.create({
      data: {
        resortId: resort.id,
        name: "Family Suite",
        maxAdults: 4,
        maxChildren: 2,
        amenities: ["AC", "WiFi", "Balcony"],
      },
    });
  }

  // rooms from the live sheet (name + observed rate in BDT)
  const roomsData: Array<[string, number, number]> = [
    ["Camellia", 6500, standardType.id],
    ["Lunaria", 7500, standardType.id],
    ["Cherry Blossom", 6500, standardType.id],
    ["Lavender", 6500, standardType.id],
    ["Margarita", 6500, standardType.id],
    ["Snow Drop", 6500, standardType.id],
    ["Jasmine", 6500, standardType.id],
    ["Rose", 6500, standardType.id],
    ["Magnolia", 6500, standardType.id],
    ["Kath Golap", 8500, familyType.id],
  ];

  for (const [name, rate, roomTypeId] of roomsData) {
    await prisma.room.upsert({
      where: { resortId_name: { resortId: resort.id, name } },
      update: { baseRate: rate },
      create: { resortId: resort.id, roomTypeId, name, baseRate: rate, status: RoomStatus.ACTIVE },
    });
  }

  // activity samples
  const existingActivities = await prisma.activityCatalog.count({ where: { resortId: resort.id } });
  if (existingActivities === 0) {
    for (const a of [
      { name: "River Kayaking", category: "WATER_SPORTS" as const, basePrice: 800, durationMin: 60 },
      { name: "Tea Garden Tour", category: "TOUR" as const, basePrice: 1500, durationMin: 180 },
      { name: "Evening BBQ by the Lake", category: "DINING" as const, basePrice: 1200, durationMin: 120 },
    ]) {
      const cat = await prisma.activityCatalog.create({
        data: {
          resortId: resort.id,
          name: a.name,
          category: a.category,
          basePrice: a.basePrice,
          durationMin: a.durationMin,
          minPerSlot: 1,
          maxPerSlot: 12,
        },
      });
      const start = utcToday(1);
      start.setUTCHours(4, 0, 0, 0); // 10:00 local
      await prisma.activitySlot.create({
        data: {
          catalogId: cat.id,
          startsAt: start,
          endsAt: new Date(start.getTime() + a.durationMin * 60000),
          capacity: 12,
        },
      });
    }
  }

  // users — login with phone + Password123!
  const admin = await prisma.user.upsert({
    where: { phone: "8801700000001" },
    update: { role: Role.RESORT_ADMIN, passwordHash },
    create: { name: "Sky Eco Manager", phone: "8801700000001", role: Role.RESORT_ADMIN, passwordHash },
  });
  await prisma.userResort.upsert({
    where: { userId_resortId: { userId: admin.id, resortId: resort.id } },
    update: {},
    create: { userId: admin.id, resortId: resort.id },
  });

  const agent = await prisma.user.upsert({
    where: { phone: "8801700000002" },
    update: { role: Role.AGENT, passwordHash },
    create: { name: "Rikan", phone: "8801700000002", role: Role.AGENT, passwordHash },
  });
  await prisma.userResort.upsert({
    where: { userId_resortId: { userId: agent.id, resortId: resort.id } },
    update: { commissionRate: 5 },
    create: { userId: agent.id, resortId: resort.id, commissionRate: 5 },
  });

  await prisma.counter.upsert({
    where: { resortId_kind: { resortId: resort.id, kind: "BOOKING" } },
    update: {},
    create: { resortId: resort.id, kind: "BOOKING", nextVal: 0 },
  });

  // one sample room booking (today → tomorrow) if none exists yet
  const bookingCount = await prisma.booking.count({ where: { resortId: resort.id } });
  if (bookingCount === 0) {
    const ci = utcToday(0);
    const co = utcToday(1);

    const crypto = await import("node:crypto");
    const guest = await prisma.guest.create({
      data: {
        resortId: resort.id,
        fullName: "Demo Guest",
        phone: "+8801700000099",
        phoneKey: crypto.createHash("sha256").update("+8801700000099").digest("hex"),
      },
    });

    const booking = await prisma.booking.create({
      data: {
        code: "BK-00001",
        resortId: resort.id,
        kind: "ROOM",
        guestId: guest.id,
        createdById: admin.id,
        source: BookingSource.DIRECT,
        checkIn: ci,
        checkOut: co,
        adults: 2,
        state: BookingState.CONFIRMED,
      },
    });

    const camellia = await prisma.room.findFirstOrThrow({
      where: { resortId: resort.id, name: "Camellia" },
    });
    const item = await prisma.bookingItem.create({
      data: {
        bookingId: booking.id,
        itemKind: "ROOM",
        roomId: camellia.id,
        qty: 1,
        unitPrice: camellia.baseRate,
      },
    });
    await prisma.bookingNight.create({
      data: { itemId: item.id, roomId: camellia.id, night: ci },
    });
    await prisma.counter.upsert({
      where: { resortId_kind: { resortId: resort.id, kind: "BOOKING" } },
      update: { nextVal: 1 },
      create: { resortId: resort.id, kind: "BOOKING", nextVal: 1 },
    });
  }

  console.log("Seeded Sky Eco Resort:", {
    tenant: tenant.slug,
    resortId: resort.id,
    logins: { manager: "8801700000001", agent: "8801700000002", pw: "Password123!" },
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
