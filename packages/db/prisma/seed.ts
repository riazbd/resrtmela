/**
 * The demo world.
 *
 * Wipes the database and builds one that explains the software: three resort
 * owners (paying, on trial, and stopped for an unpaid bill), three travel
 * agencies (verified, waiting, and suspended), four resorts with their rooms,
 * rates, taxes, staff and offers, and six months of trading either side of
 * today — stays, money, the restaurant, the costs, and the trail all of it
 * leaves.
 *
 *   pnpm -F @rh/db seed -- --force
 *
 * `--force` is required because this deletes everything first. Every account's
 * password is `Password123!`.
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../src";
import { rng, at, TABLES_IN_WIPE_ORDER } from "./seed/util";

/**
 * `tsx` does not read `.env`, and the Prisma CLI that usually does is not in
 * this path — so the seed finds the database the same way the API does.
 */
for (const file of ["../.env", "../../.env", "../../apps/api/.env"]) {
  const full = path.resolve(__dirname, file);
  if (!fs.existsSync(full)) continue;
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2];
  }
}
import { seedPlatform } from "./seed/platform";
import { seedAccounts } from "./seed/accounts";
import { setUpResort } from "./seed/resort-setup";
import { seedTrade } from "./seed/trade";
import { seedAgency } from "./seed/agencies";
import { reportCoverage, printCoverage } from "./seed/coverage";

const prisma = new PrismaClient();

async function wipe() {
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of [...new Set(TABLES_IN_WIPE_ORDER)]) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``);
  }
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
}

async function main() {
  if (!process.argv.includes("--force")) {
    console.error(
      "This deletes every row in the database before seeding.\n" +
        "Run it with --force when that is what you want:\n\n" +
        "  pnpm -F @rh/db seed -- --force\n",
    );
    process.exit(1);
  }

  const url = process.env.DATABASE_URL ?? "";
  console.log(`Seeding ${url.replace(/:[^:@]*@/, ":***@") || "(no DATABASE_URL)"}`);

  const r = rng();
  await wipe();

  const offers = await seedPlatform(prisma);
  const world = await seedAccounts(prisma, offers);

  // the invitation one resort sent an agency that has not answered yet
  await prisma.offer.create({
    data: {
      code: "INVITE7K2M9X", audience: "AGENCY", plan: "AGENCY_BASIC", maxUses: 1, uses: 0,
      email: "hello@bluebirdtours.example", resortId: world.resorts.skyEco.resort.id,
      note: `Invited by ${world.resorts.skyEco.resort.name}`, expiresAt: at(24, 12),
      createdById: world.resorts.skyEco.admin.id, createdAt: at(-6, 12),
    },
  });

  const seaBreezeAgents = [
    { userId: world.agencies.seaBreeze.owner.id, name: "Sea Breeze Travels" },
    { userId: world.agencies.seaBreeze.staff.id, name: "Sea Breeze Travels" },
  ];
  const hillAgents = [{ userId: world.agencies.hillTrack.owner.id, name: "Hill Track Tours" }];

  // ── the four resorts ────────────────────────────────────────────────────
  const sky = world.resorts.skyEco;
  const skySetup = await setUpResort(prisma, sky.resort.id, {
    types: [
      { name: "Deluxe Twin", maxAdults: 2, maxChildren: 1, rate: 4500, count: 5 },
      { name: "Garden Cottage", maxAdults: 2, maxChildren: 2, rate: 6500, count: 4, extra: true },
      { name: "Family Suite", maxAdults: 4, maxChildren: 2, rate: 9500, count: 3, extra: true },
    ],
    staff: [
      { userId: sky.admin.id, role: "Administrator" },
      { userId: sky.manager.id, role: "Manager" },
      { userId: sky.desk.id, role: "Front Desk" },
      { userId: sky.housekeeping.id, role: "Night Auditor" },
    ],
    activities: [
      { name: "Tea garden walk", category: "TOUR", price: 900, durationMin: 120 },
      { name: "Lawachara night trek", category: "TOUR", price: 1500, durationMin: 180 },
      { name: "Ayurvedic massage", category: "WELLNESS", price: 2200, durationMin: 60 },
    ],
    employees: [
      { name: "Abdul Karim", designation: "Head chef", salary: 28000 },
      { name: "Jahangir Alam", designation: "Security guard", salary: 14000 },
      { name: "Shirin Sultana", designation: "Housekeeping", salary: 13000 },
      { name: "Masud Parvez", designation: "Gardener", salary: 11000 },
      { name: "Rumana Akter", designation: "Kitchen help", salary: 10000 },
      { name: "Nazmul Huda", designation: "Night guard (left)", salary: 12000 },
    ],
  }, r);
  await seedTrade(prisma, {
    resortId: sky.resort.id, rooms: skySetup.rooms, activityIds: skySetup.activityIds,
    staff: { adminId: sky.admin.id, deskId: sky.desk.id },
    agents: seaBreezeAgents, prefixes: { booking: "BK", invoice: "SER", fb: "RES" },
    fromDay: -120, r,
  });

  const hill = world.resorts.hilltop;
  const hillSetup = await setUpResort(prisma, hill.resort.id, {
    types: [
      { name: "Valley View Twin", maxAdults: 2, maxChildren: 1, rate: 5500, count: 4 },
      { name: "Hill Cottage", maxAdults: 3, maxChildren: 1, rate: 8000, count: 3, extra: true },
    ],
    staff: [
      { userId: hill.admin.id, role: "Administrator" },
      { userId: hill.manager.id, role: "Manager" },
    ],
    activities: [
      { name: "Sunrise at Konglak", category: "TOUR", price: 1200, durationMin: 150 },
      { name: "Chander Gari village tour", category: "TOUR", price: 3500, durationMin: 240 },
    ],
    employees: [
      { name: "Ching Mrong", designation: "Caretaker", salary: 16000 },
      { name: "Mongsai Marma", designation: "Cook", salary: 15000 },
      { name: "Thoai Aung", designation: "Helper (left)", salary: 9000 },
    ],
  }, r);
  await seedTrade(prisma, {
    resortId: hill.resort.id, rooms: hillSetup.rooms, activityIds: hillSetup.activityIds,
    staff: { adminId: hill.admin.id, deskId: hill.manager.id },
    agents: hillAgents, prefixes: { booking: "HB", invoice: "HIL", fb: "HRS" },
    fromDay: -90, r,
  });

  const cox = world.resorts.cox;
  const coxSetup = await setUpResort(prisma, cox.resort.id, {
    types: [
      { name: "Sea View King", maxAdults: 2, maxChildren: 2, rate: 7500, count: 6, extra: true },
      { name: "Premier Suite", maxAdults: 4, maxChildren: 2, rate: 13500, count: 2, extra: true },
    ],
    staff: [
      { userId: cox.admin.id, role: "Administrator" },
      { userId: cox.desk.id, role: "Front Desk" },
    ],
    activities: [
      { name: "Beach jet-ski", category: "WATER_SPORTS", price: 2500, durationMin: 30 },
      { name: "Inani sunset boat", category: "TOUR", price: 1800, durationMin: 90 },
    ],
    employees: [
      { name: "Sohel Rana", designation: "Front office", salary: 19000 },
      { name: "Parvin Akter", designation: "Housekeeping", salary: 13000 },
    ],
  }, r);
  await seedTrade(prisma, {
    resortId: cox.resort.id, rooms: coxSetup.rooms, activityIds: coxSetup.activityIds,
    staff: { adminId: cox.admin.id, deskId: cox.desk.id },
    agents: seaBreezeAgents, prefixes: { booking: "CB", invoice: "CBR", fb: "CFB" },
    fromDay: -9, r,
  });

  const green = world.resorts.green;
  const greenSetup = await setUpResort(prisma, green.resort.id, {
    types: [{ name: "Eco Cottage", maxAdults: 2, maxChildren: 1, rate: 3500, count: 4 }],
    staff: [{ userId: green.admin.id, role: "Administrator" }],
    activities: [{ name: "Nilgiri day trip", category: "TOUR", price: 2800, durationMin: 300 }],
    employees: [{ name: "Aung Shwe", designation: "Caretaker", salary: 12000 }],
  }, r);
  await seedTrade(prisma, {
    resortId: green.resort.id, rooms: greenSetup.rooms, activityIds: greenSetup.activityIds,
    staff: { adminId: green.admin.id, deskId: green.admin.id },
    agents: [], prefixes: { booking: "GL", invoice: "GLE", fb: "GFB" },
    fromDay: -120, r,
  });

  // ── the agencies' own books ─────────────────────────────────────────────
  const firstGuest = await prisma.guest.findFirst({ where: { resortId: sky.resort.id }, orderBy: { id: "asc" } });
  const agentBooking = await prisma.booking.findFirst({
    where: { agentUserId: world.agencies.seaBreeze.owner.id }, orderBy: { id: "asc" }, select: { id: true },
  });
  await seedAgency(prisma, {
    accountName: "Sea Breeze Travels", ownerId: world.agencies.seaBreeze.owner.id,
    staffId: world.agencies.seaBreeze.staff.id, guestId: firstGuest?.id, bookingId: agentBooking?.id, r, full: true,
  });
  await seedAgency(prisma, { accountName: "Hill Track Tours", ownerId: world.agencies.hillTrack.owner.id, r, full: false });
  await seedAgency(prisma, { accountName: "Padma Voyages", ownerId: world.agencies.padma.owner.id, r, full: false });

  // ── email credits, the packs bought with them, and what they cost ───────
  for (const [ownerId, resortId, credits] of [
    [sky.admin.id, sky.resort.id, 1460],
    [cox.admin.id, cox.resort.id, 500],
    [world.agencies.seaBreeze.owner.id, sky.resort.id, 320],
  ] as const) {
    await prisma.emailCredit.create({ data: { userId: ownerId, credits, purchasedAt: at(-40, 12) } });
  }
  await prisma.emailCreditOrder.createMany({
    data: [
      { userId: sky.admin.id, resortId: sky.resort.id, credits: 2000, price: 1800, status: "APPROVED", clientRef: `ord-${sky.resort.id}-1`, note: "Paid by bKash, trx 9F2K1L", decidedById: world.platformOwner.id, decidedAt: at(-40, 12), createdAt: at(-41, 18) },
      { userId: sky.admin.id, resortId: sky.resort.id, credits: 10000, price: 7500, status: "PENDING", clientRef: `ord-${sky.resort.id}-2`, note: "Sending the transfer tomorrow", createdAt: at(-1, 17) },
      { userId: cox.admin.id, resortId: cox.resort.id, credits: 500, price: 500, status: "REJECTED", clientRef: `ord-${cox.resort.id}-1`, note: "No payment received against this request", decidedById: world.platformOwner.id, decidedAt: at(-3, 11), createdAt: at(-6, 9) },
    ],
  });
  await prisma.platformCharge.createMany({
    data: [
      { resortId: sky.resort.id, kind: "EMAIL_CREDITS", description: "2,000 email credits", amount: 1800, status: "PAID", clientRef: `chg-${sky.resort.id}-1`, createdById: world.platformOwner.id, paidAt: at(-39, 10), note: "bKash 9F2K1L", createdAt: at(-40, 12) },
      { resortId: sky.resort.id, kind: "EMAIL_CREDITS", description: "10,000 email credits", amount: 7500, status: "DUE", clientRef: `chg-${sky.resort.id}-2`, createdById: world.platformOwner.id, createdAt: at(-1, 17) },
      { resortId: cox.resort.id, kind: "SETUP", description: "Data import from the old spreadsheet", amount: 3000, status: "WAIVED", clientRef: `chg-${cox.resort.id}-1`, createdById: world.platformOwner.id, note: "Waived for the first month", createdAt: at(-8, 12) },
    ],
  });
  await prisma.emailCampaign.createMany({
    data: [
      { userId: sky.admin.id, resortId: sky.resort.id, subject: "Monsoon at Sky Eco — 10% off through September", body: "Dear guest,\n\nThe tea gardens are at their greenest. Stay two nights and the third is ten percent off.\n\n— Sky Eco Resort", recipients: 412, status: "SENT", sentAt: at(-30, 11) },
      { userId: sky.admin.id, resortId: sky.resort.id, subject: "Eid greetings from Sky Eco", body: "Eid Mubarak from all of us at Sky Eco Resort.", recipients: 380, status: "PARTIAL", sentAt: at(-70, 10) },
      { userId: world.agencies.seaBreeze.owner.id, resortId: null, subject: "Sajek packages — winter dates open", body: "Winter dates for Sajek are open. Reply to hold seats.", recipients: 120, status: "SENT", sentAt: at(-15, 16) },
    ],
  });

  // ── the old access requests, from before the door was opened ────────────
  await prisma.resortAccess.createMany({
    data: [
      { userId: world.agencies.seaBreeze.owner.id, resortId: sky.resort.id, status: "APPROVED", note: "We bring 20-30 guests a month from Dhaka.", decidedAt: at(-118, 10), createdAt: at(-120, 9) },
      { userId: world.agencies.padma.owner.id, resortId: green.resort.id, status: "REJECTED", note: "Asked for 25% commission.", decidedAt: at(-100, 14), createdAt: at(-102, 9) },
    ],
  });

  const coverage = await reportCoverage(prisma);
  printCoverage(coverage);

  console.log(`
Sign in with any of these — the password is Password123!

  platform@resortmela.com     the platform owner (Platform → everything)
  owner@skyeco.example        Sky Eco Group: two resorts, paying, Chain plan
  manager@skyeco.example      Sky Eco Resort, Manager
  desk@skyeco.example         Sky Eco Resort, Front Desk
  owner@coxbay.example        Cox Bay: inside its free trial, wants to downgrade
  owner@greenleaf.example     Green Leaf: suspended, one invoice overdue
  rafiq@seabreeze.example     Sea Breeze Travels: verified agency, Pro plan
  nabila@seabreeze.example    Sea Breeze staff, booking desk role only
  tanvir@hilltrack.example    Hill Track Tours: signed up through an offer, waiting to be verified
  saiful@padmavoyages.example Padma Voyages: suspended for an unpaid bill
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
