/**
 * Integration-test harness: a real MySQL database, not mocks.
 *
 * The booking engine's guarantees (the booking_nights UNIQUE guard, money that
 * is recomputed on every read, per-resort counters) only exist at the database
 * level, so testing them against a fake proves nothing.
 *
 * Setup, once:  pnpm -F @rh/api test:setup
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@rh/db";

/** The API reads the root .env at boot; tests are not booted by Nest, so do it here. */
function databaseUrlFromRootEnv(): string | undefined {
  try {
    const text = readFileSync(resolve(__dirname, "..", "..", "..", "..", ".env"), "utf8");
    return text.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)/m)?.[1];
  } catch {
    return undefined;
  }
}

/** resorthub_test, derived from DATABASE_URL so no second secret is needed. */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL ?? databaseUrlFromRootEnv();
  if (!base) {
    throw new Error("DATABASE_URL is not set — cannot derive the test database URL");
  }
  const url = new URL(base);
  url.pathname = "/resorthub_test";
  return url.toString();
}

export function testPrisma(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: testDatabaseUrl() } } });
}

/**
 * Every table, ordered so that truncation never fights a foreign key.
 * FK checks are disabled anyway, but keeping the order honest documents the
 * graph and keeps the failure mode obvious if that ever changes.
 */
const TABLES = [
  "booking_nights", "booking_items", "payments", "payment_intents",
  "fb_bill_items", "fb_bills", "bookings", "guests",
  "activity_slots", "activity_schedules", "activity_catalog",
  "rate_plans", "rooms", "room_types",
  "payroll_payments", "employees", "food_packages",
  "wallet_txns", "wallets", "subscription_dues", "subscriptions",
  "email_campaigns", "email_credits", "notifications", "resort_access",
  "api_keys", "discount_offers", "expenses", "counters", "audit_log",
  "notification_jobs", "user_resorts", "roles", "users",
  "resorts", "tenants", "platform_plans", "cms_settings",
];

/** Wipes the test database. Refuses to touch anything not named *_test. */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  const name = new URL(testDatabaseUrl()).pathname.slice(1);
  if (!name.endsWith("_test")) {
    throw new Error(`Refusing to reset "${name}" — the test database name must end in _test`);
  }
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of TABLES) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``);
  }
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
}

export interface Fixture {
  tenantId: number;
  resortId: number;
  roomTypeId: number;
  rooms: { id: number; name: string }[];
  managerId: number;
  agentId: number;
  guestId: number;
}

/** One resort, two rooms at ৳5000, a manager, an agent and a guest. */
export async function seedResort(prisma: PrismaClient): Promise<Fixture> {
  const tenant = await prisma.tenant.create({ data: { name: "Test Tenant", slug: `t-${Date.now()}` } });
  const resort = await prisma.resort.create({
    data: { tenantId: tenant.id, name: "Test Resort", location: "Cox's Bazar" },
  });
  const roomType = await prisma.roomType.create({
    data: { resortId: resort.id, name: "Deluxe", maxAdults: 2, maxChildren: 2 },
  });
  const rooms = [];
  for (const name of ["101", "102"]) {
    rooms.push(
      await prisma.room.create({
        data: { resortId: resort.id, roomTypeId: roomType.id, name, baseRate: 5000 },
      }),
    );
  }
  const manager = await prisma.user.create({
    data: { name: "Test Manager", phone: `8801${Date.now().toString().slice(-9)}`, role: "MANAGER" },
  });
  await prisma.userResort.create({ data: { userId: manager.id, resortId: resort.id } });
  const agent = await prisma.user.create({
    data: { name: "Test Agent", phone: `8802${Date.now().toString().slice(-9)}`, role: "AGENT", status: "active" },
  });
  await prisma.userResort.create({
    data: { userId: agent.id, resortId: resort.id, commissionRate: 10, commissionKind: "PERCENT" },
  });
  const guest = await prisma.guest.create({
    data: {
      resortId: resort.id,
      fullName: "Test Guest",
      phone: "8801711111111",
      phoneKey: "test-phone-key",
      email: "guest@example.com",
    },
  });
  await prisma.counter.create({ data: { resortId: resort.id, kind: "BOOKING", nextVal: 0 } });

  return {
    tenantId: tenant.id,
    resortId: resort.id,
    roomTypeId: roomType.id,
    rooms: rooms.map((r) => ({ id: r.id, name: r.name })),
    managerId: manager.id,
    agentId: agent.id,
    guestId: guest.id,
  };
}

/** A booking with rooms, nights and an optional advance — the shape services expect. */
export async function seedBooking(
  prisma: PrismaClient,
  fx: Fixture,
  opts: {
    roomId?: number;
    checkIn: string;
    checkOut: string;
    unitPrice?: number;
    discount?: number;
    advance?: number;
    state?: "PENDING" | "CONFIRMED" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED" | "NO_SHOW";
    code?: string;
  },
) {
  const roomId = opts.roomId ?? fx.rooms[0]!.id;
  const checkIn = new Date(`${opts.checkIn}T00:00:00Z`);
  const checkOut = new Date(`${opts.checkOut}T00:00:00Z`);
  const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000);

  const booking = await prisma.booking.create({
    data: {
      code: opts.code ?? `BK-${String(Math.floor(Math.random() * 89999) + 10000)}`,
      resortId: fx.resortId,
      guestId: fx.guestId,
      createdById: fx.managerId,
      checkIn,
      checkOut,
      adults: 2,
      discount: (opts.discount ?? 0) as never,
      state: opts.state ?? "CONFIRMED",
    },
  });
  const item = await prisma.bookingItem.create({
    data: {
      bookingId: booking.id,
      itemKind: "ROOM",
      roomId,
      qty: 1,
      unitPrice: (opts.unitPrice ?? 5000) as never,
    },
  });
  await prisma.bookingNight.createMany({
    data: Array.from({ length: nights }, (_, i) => ({
      itemId: item.id,
      roomId,
      night: new Date(checkIn.getTime() + i * 86_400_000),
    })),
  });
  if (opts.advance) {
    await prisma.payment.create({
      data: {
        bookingId: booking.id,
        amount: opts.advance as never,
        method: "CASH",
        paymentType: "ADVANCE",
        receivedById: fx.managerId,
      },
    });
  }
  return { ...booking, nights, itemId: item.id };
}
