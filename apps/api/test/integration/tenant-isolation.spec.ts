/**
 * What one tenant may not see, or touch, of another.
 *
 * `second-tenant.spec.ts` proves a second resort can be *configured* — its own
 * currency, timezone and plan. This file proves the other half: that the second
 * resort's data stays its own.
 *
 * The distinction matters because every hole below is invisible today. There is
 * one real customer, so there is nobody to leak to, and a test suite that seeds
 * one resort cannot see a boundary it never crosses. Each of these was found by
 * reading, and each is written here first, red, so that "we fixed it" is a
 * thing the suite says rather than a thing a document claims.
 *
 * The shape follows `agent-visibility.spec.ts`: doors that must stay shut.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import {
  makeBookingsService,
  makeNotificationsService,
  makeEngageService,
  makeGuestService,
  makeTenancyService,
  makePlatformService,
  makeIntentsService,
  makeImportService,
} from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ActivitiesService } from "../../src/activities/activities.service";
import { AuditService } from "../../src/common/audit.service";
import { PermissionsService } from "../../src/common/permissions";
import { normalizePhone, phoneKey } from "../../src/common/dates";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;

/** Two tenants that have never heard of each other. */
let ours: Fixture;
let theirs: Fixture;
let usManager: JwtClaims;

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  ours = await seedResort(prisma as unknown as PrismaClient);
  theirs = await seedResort(prisma as unknown as PrismaClient);
  usManager = { userId: ours.managerId, role: ROLE.MANAGER, resortIds: [ours.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("the messages a resort sent to its own guests", () => {
  it("does not list another tenant's outgoing mail", async () => {
    const notifications = makeNotificationsService(asPrisma);
    await prisma.notificationJob.createMany({
      data: [
        {
          channel: "EMAIL", toRef: "us@example.com", template: "booking_confirmed",
          dedupeKey: "ours-1", resortId: ours.resortId,
          payload: { code: "OURS-1" } as never,
        },
        {
          channel: "EMAIL", toRef: "them@example.com", template: "booking_confirmed",
          dedupeKey: "theirs-1", resortId: theirs.resortId,
          // the real payload carries the guest's name, phone and what they owe
          payload: { code: "THEIRS-1", due: 12500 } as never,
        },
      ],
    });

    const rows = await notifications.recent(usManager, 50);

    expect(rows.map((r) => r.resortId)).not.toContain(theirs.resortId);
    // the payload is where the guest's name, code and balance actually live
    expect(rows.map((r) => (r.payload as { code?: string } | null)?.code)).not.toContain("THEIRS-1");
    expect(rows).toHaveLength(1);
  });
});

describe("a marketing campaign", () => {
  it("refuses to mail the guest list of a resort the sender does not hold", async () => {
    const engage = makeEngageService(asPrisma);
    await prisma.emailCredit.create({ data: { userId: ours.managerId, credits: 500 } });
    await prisma.guest.update({
      where: { id: theirs.guestId },
      data: { email: "their-customer@example.com" },
    });

    // our manager, naming their resort: the permission is checked against ours
    // and the audience is read from the body
    await expect(
      engage.sendCampaign(usManager, {
        subject: "Winter offer",
        body: "Hello {name}",
        audience: "RESORT_GUESTS",
        resortId: theirs.resortId,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("editing a booking", () => {
  it("refuses a room that belongs to another resort", async () => {
    const bookings = makeBookingsService(asPrisma);
    const booking = await seedBooking(prisma as unknown as PrismaClient, ours, {
      checkIn: "2026-11-01", checkOut: "2026-11-03",
    });
    const theirRoom = theirs.rooms[0]!.id;

    await expect(
      bookings.update(usManager, booking.id, { roomIds: [theirRoom] }),
    ).rejects.toMatchObject({ status: 400 });

    // and nothing may be holding their inventory afterwards
    const held = await prisma.bookingNight.count({ where: { roomId: theirRoom } });
    expect(held).toBe(0);
  });
});

describe("adding an activity to a booking", () => {
  it("refuses a slot from another resort's catalogue", async () => {
    const activities = new ActivitiesService(
      asPrisma,
      new AuditService(asPrisma),
      new PermissionsService(asPrisma),
    );
    const booking = await seedBooking(prisma as unknown as PrismaClient, ours, {
      checkIn: "2026-11-01", checkOut: "2026-11-03",
    });
    const theirCatalog = await prisma.activityCatalog.create({
      data: { resortId: theirs.resortId, name: "Their sunset cruise", basePrice: 1200 as never },
    });
    const theirSlot = await prisma.activitySlot.create({
      data: {
        catalogId: theirCatalog.id,
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 90_000_000),
        capacity: 10,
      },
    });

    await expect(
      activities.addToBooking(usManager, booking.id, theirSlot.id, 2),
    ).rejects.toMatchObject({ status: 400 });

    const after = await prisma.activitySlot.findUniqueOrThrow({ where: { id: theirSlot.id } });
    expect(after.bookedCount).toBe(0);
  });
});

describe("a guest with no phone number", () => {
  it("is not handed every other phone-less guest's stays", async () => {
    const guests = makeGuestService(asPrisma);
    // a walk-in at their resort, taken without a phone: the code writes ""
    const emptyKey = phoneKey(normalizePhone(""));
    const theirWalkIn = await prisma.guest.create({
      data: {
        resortId: theirs.resortId,
        fullName: "Their walk-in",
        phone: "",
        phoneKey: emptyKey,
      },
    });
    await prisma.booking.create({
      data: {
        code: "THEIRS-WK", resortId: theirs.resortId, guestId: theirWalkIn.id,
        checkIn: new Date("2026-11-01T00:00:00Z"), checkOut: new Date("2026-11-03T00:00:00Z"),
        adults: 2, state: "CONFIRMED",
      },
    });
    // someone who signed up with an email address, so their user row has no phone
    const emailOnly = await prisma.user.create({
      data: { name: "Email signup", email: "someone@example.com", role: "GUEST", status: "active" },
    });

    const trips = await guests.trips({ userId: emailOnly.id, role: ROLE.GUEST, resortIds: [] });

    // nothing at all: this user has never stayed anywhere
    expect(trips).toEqual([]);
  });
});

describe("what an agency may read of a resort it sells", () => {
  it("is the shop window, not the tax rate and the room rates", async () => {
    const tenancy = makeTenancyService(asPrisma);
    await prisma.resort.update({
      where: { id: ours.resortId },
      data: { taxRatePct: 15 as never, showRatesToAgents: false },
    });
    const agentOfOurs: JwtClaims = {
      userId: ours.agentId, role: ROLE.AGENT, resortIds: [ours.resortId],
    };

    const detail = await tenancy.detail(agentOfOurs, ours.resortId);

    expect(detail).not.toHaveProperty("taxRatePct");
    expect(JSON.stringify(detail.rooms)).not.toContain("baseRate");
  });
});

describe("who a resort's own admin may change", () => {
  it("cannot promote a colleague to resort admin", async () => {
    const platform = makePlatformService(asPrisma);
    const clerk = await prisma.user.create({
      data: { name: "Clerk", phone: "8801999000111", role: "FRONT_DESK", status: "active" },
    });
    await prisma.userResort.create({ data: { userId: clerk.id, resortId: ours.resortId } });

    // creating a RESORT_ADMIN is refused; updating one into existence was not
    await expect(
      platform.updateResortUser(usManager, ours.resortId, clerk.id, { role: "RESORT_ADMIN" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("cannot reset the password of someone who also works at another resort", async () => {
    const platform = makePlatformService(asPrisma);
    // one person, two employers — the `users` row is global, this route is not
    const shared = await prisma.user.create({
      data: { name: "Works at both", phone: "8801999000222", role: "MANAGER", status: "active" },
    });
    await prisma.userResort.create({ data: { userId: shared.id, resortId: ours.resortId } });
    await prisma.userResort.create({ data: { userId: shared.id, resortId: theirs.resortId } });

    await expect(
      platform.updateResortUser(usManager, ours.resortId, shared.id, { password: "hunter2hunter2" }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("approving an agency's request to sell a resort", () => {
  it("does not rewrite the role of someone who is staff elsewhere", async () => {
    const engage = makeEngageService(asPrisma);
    const theirManager = await prisma.user.findUniqueOrThrow({ where: { id: theirs.managerId } });
    await prisma.resortAccess.create({
      data: { userId: theirManager.id, resortId: ours.resortId, status: "PENDING" },
    });
    const request = await prisma.resortAccess.findFirstOrThrow({
      where: { userId: theirManager.id, resortId: ours.resortId },
    });

    await expect(
      engage.decideAccess(usManager, request.id.toString(), true),
    ).rejects.toMatchObject({ status: 400 });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: theirManager.id } });
    expect(after.role).toBe("MANAGER");
  });

  it("does not quietly reactivate a suspended account", async () => {
    const engage = makeEngageService(asPrisma);
    const banned = await prisma.user.create({
      data: { name: "Suspended agent", phone: "8801999000333", role: "AGENT", status: "suspended" },
    });
    const request = await prisma.resortAccess.create({
      data: { userId: banned.id, resortId: ours.resortId, status: "PENDING" },
    });

    await expect(
      engage.decideAccess(usManager, request.id.toString(), true),
    ).rejects.toMatchObject({ status: 400 });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: banned.id } });
    expect(after.status).toBe("suspended");
  });
});

describe("the activity log", () => {
  it("does not let a resort's admin erase the platform's own history", async () => {
    const platform = makePlatformService(asPrisma);
    // a platform event: no resortId, so the resort check was skipped entirely
    const platformRow = await prisma.auditLog.create({
      data: { action: "platform.login_as", entity: "user", entityId: 1 },
    });
    const admin: JwtClaims = {
      userId: ours.managerId, role: ROLE.RESORT_ADMIN, resortIds: [ours.resortId],
    };

    await expect(
      platform.deleteActivity(admin, platformRow.id.toString()),
    ).rejects.toMatchObject({ status: 403 });

    expect(await prisma.auditLog.count({ where: { id: platformRow.id } })).toBe(1);
  });

  it("records the deletion of an entry, with what the entry said", async () => {
    const platform = makePlatformService(asPrisma);
    const row = await prisma.auditLog.create({
      data: {
        resortId: ours.resortId, action: "expense.delete", entity: "expense", entityId: 7,
        diff: { amount: 50000 } as never,
      },
    });
    const admin: JwtClaims = {
      userId: ours.managerId, role: ROLE.RESORT_ADMIN, resortIds: [ours.resortId],
    };

    await platform.deleteActivity(admin, row.id.toString());

    const trace = await prisma.auditLog.findFirst({ where: { action: "auditlog.delete" } });
    expect(trace).not.toBeNull();
    expect(JSON.stringify(trace!.diff)).toContain("expense.delete");
  });
});

describe("the mock gateway's confirm button", () => {
  it("will not settle a booking for someone who has nothing to do with it", async () => {
    const intents = makeIntentsService(asPrisma);
    const booking = await seedBooking(prisma as unknown as PrismaClient, ours, {
      checkIn: "2026-11-01", checkOut: "2026-11-03",
    });
    const session = await intents.createCheckout(usManager, booking.id, {
      method: "BKASH", amount: 1000,
    });

    // a signed-in stranger — an agent at the other resort — with the reference
    const stranger: JwtClaims = {
      userId: theirs.agentId, role: ROLE.AGENT, resortIds: [theirs.resortId],
    };
    await expect(
      intents.confirmMock(stranger, session.providerRef, "trx-1"),
    ).rejects.toMatchObject({ status: 403 });

    const after = await prisma.paymentIntent.findUniqueOrThrow({
      where: { providerRef: session.providerRef },
    });
    expect(after.status).toBe("pending");
    expect(await prisma.payment.count({ where: { bookingId: booking.id } })).toBe(0);
  });
});

describe("a spreadsheet import", () => {
  it("does not grant a stranger access to the resort it is imported into", async () => {
    const importer = makeImportService(asPrisma);
    // the other tenant's manager, named in our sheet's "Advance received" column
    const theirManager = await prisma.user.findUniqueOrThrow({ where: { id: theirs.managerId } });
    const header =
      "Booking ID,Booking Date,Guest Name,Mobile,NID/Passport No,Room,Check-In,Check-Out,Nights," +
      "Room Rate,Rent,Discount,Advance,Due,Payment Status,Booking Source,Advance received," +
      "Adults,Children,Status,Remarks";
    const row =
      `BK-90001,01-Nov-2026,Walk in,,,101,01-Nov-2026,02-Nov-2026,1,5000,5000,0,1000,4000,` +
      `Partial,Agent,${theirManager.name},2,0,Confirmed,`;

    const report = await importer.import(usManager, ours.resortId, `${header}\n${row}`, false);

    // no link was handed out, and the booking is honestly unattributed
    const granted = await prisma.userResort.count({
      where: { userId: theirManager.id, resortId: ours.resortId },
    });
    expect(granted).toBe(0);
    expect(report.unmatchedAgents).toContain(theirManager.name);
    const booking = await prisma.booking.findFirst({ where: { code: "BK-90001" } });
    expect(booking?.agentUserId).toBeNull();
  });
});
