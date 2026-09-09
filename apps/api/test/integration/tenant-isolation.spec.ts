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
