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
/**
 * Never truncated: the migration ledger. Everything else in the schema goes.
 *
 * This used to be a hand-written list of every table. It drifted the moment a
 * migration added one — `email_credit_orders` arrived and eleven rows from
 * earlier tests were still sitting in it, so specs that counted rows passed or
 * failed depending on what had run before them. A list that has to be edited
 * in step with the schema is a list that will be wrong; the database knows its
 * own tables, so ask it.
 */
const NEVER_TRUNCATE = new Set(["_prisma_migrations"]);

/** Every table in the test schema, from the database rather than from memory. */
async function allTables(prisma: PrismaClient, schema: string): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ TABLE_NAME: string }[]>(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
    schema,
  );
  return rows.map((r) => r.TABLE_NAME).filter((t) => !NEVER_TRUNCATE.has(t));
}

/** Wipes the test database. Refuses to touch anything not named *_test. */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  const name = new URL(testDatabaseUrl()).pathname.slice(1);
  if (!name.endsWith("_test")) {
    throw new Error(`Refusing to reset "${name}" — the test database name must end in _test`);
  }
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
  // FK checks are off, so the order does not matter — which is the other
  // reason the hand-written list had no business existing
  for (const table of await allTables(prisma, name)) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``);
  }
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
  await seedPlatformPlans(prisma);
}

/**
 * The plan catalogue, restored after every wipe.
 *
 * `platform_plans` is never empty in a real database — a migration seeds it and
 * the super admin edits it from there. Leaving it empty in tests would be
 * testing a state that cannot happen, and it is the state that used to send
 * every limit lookup into a hard-coded constant instead.
 *
 * These are the same rows as migration 20260909250000_one_plan_vocabulary.
 */
export async function seedPlatformPlans(prisma: PrismaClient): Promise<void> {
  await prisma.platformPlan.createMany({
    data: [
      { name: "STARTER", label: "Starter", monthlyFee: 2500 as never, maxRooms: 10, maxResorts: 1, sortOrder: 1 },
      { name: "GROWTH", label: "Growth", monthlyFee: 5000 as never, maxRooms: 40, maxResorts: 2, sortOrder: 2, highlight: true },
      { name: "CHAIN", label: "Chain", monthlyFee: 12000 as never, maxRooms: 10000, maxResorts: 10, sortOrder: 3 },
      // retired names existing tenants still carry, with the limits they had
      { name: "FREE", label: "Free (legacy)", monthlyFee: 0 as never, maxRooms: 10, maxResorts: 1, active: false, sortOrder: 90 },
      { name: "STANDARD", label: "Standard (legacy)", monthlyFee: 0 as never, maxRooms: 50, maxResorts: 3, active: false, sortOrder: 91 },
      { name: "PRO", label: "Pro (legacy)", monthlyFee: 0 as never, maxRooms: 500, maxResorts: 10, active: false, sortOrder: 92 },
    ],
    skipDuplicates: true,
  });
}

export interface Fixture {
  tenantId: number;
  resortId: number;
  roomTypeId: number;
  rooms: { id: number; name: string }[];
  managerId: number;
  agentId: number;
  /** the agent's agency account — verified, so it sells the (open) fixture resort */
  agencyId: number;
  guestId: number;
}

/**
 * A counter, not the clock: tests that freeze time would otherwise generate
 * the same slug and phone number twice and collide on the unique index.
 */
let fixtureSeq = 0;

/** One resort, two rooms at 5000, a manager, an agent and a guest. */
export async function seedResort(prisma: PrismaClient): Promise<Fixture> {
  const seq = ++fixtureSeq;
  const uniq = `${seq}-${Math.floor(Math.random() * 1e6)}`;
  const tenant = await prisma.tenant.create({ data: { name: "Test Tenant", slug: `t-${uniq}` } });
  const resort = await prisma.resort.create({
    data: {
      tenantId: tenant.id,
      name: "Test Resort",
      location: "Cox's Bazar",
      // commission is the resort's term, not the agent's: 10% here so the
      // specs that were written against the fixture agent's old 10% still
      // describe the same resort
      agentCommissionKind: "PERCENT",
      agentCommissionRate: 10,
      // open to agencies, so the fixture agent sells it the way every agent
      // does now: by being verified, not by holding a row in user_resorts
      agentsOpen: true,
    },
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
  // both, because the database no longer holds an account without either
  const manager = await prisma.user.create({
    data: {
      name: "Test Manager",
      phone: `8801${String(seq).padStart(4, "0")}${Math.floor(Math.random() * 1e5)}`,
      email: `manager-${uniq}@example.com`,
      role: "MANAGER",
    },
  });
  await prisma.userResort.create({ data: { userId: manager.id, resortId: resort.id } });
  const agent = await prisma.user.create({
    data: {
      name: "Test Agent",
      phone: `8802${String(seq).padStart(4, "0")}${Math.floor(Math.random() * 1e5)}`,
      email: `agent-${uniq}@example.com`,
      role: "AGENT",
      status: "active",
      account: { create: { name: "Test Agency", slug: `agency-${uniq}`, kind: "AGENCY", status: "active" } },
    },
  });
  const guest = await prisma.guest.create({
    data: {
      resortId: resort.id,
      fullName: "Test Guest",
      phone: "8801711111111",
      phoneKey: `test-phone-key-${uniq}`,
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
    agencyId: agent.accountId!,
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
