/**
 * The words a resort sends its own guests.
 *
 * Every message went out in wording compiled into the build. A resort could
 * not change a syllable of what reached their guest under their own name —
 * could not add their check-in time, could not write it in Bangla, could not
 * soften a payment reminder for a repeat customer. "Nothing hardcoded" has to
 * mean this too, or it means very little: this is the part of the product the
 * guest actually sees.
 *
 * The rules held here:
 *  - a resort's own wording wins over the built-in one
 *  - the built-in one is the fallback, so a new resort works on day one
 *  - one resort's wording never reaches another resort's guest
 *  - a template that names a placeholder the data does not have is rejected
 *    when it is saved, not silently rendered as "?" to a guest
 *  - the platform's own messages about billing are not tenant-editable
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makeTemplatesService, makeNotificationsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let admin: JwtClaims;

const templates = () => makeTemplatesService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  admin = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

const data = {
  resort: "Sky Eco Resort",
  code: "BK-00042",
  checkin: "2026-09-04",
  checkout: "2026-09-06",
  due: 12500,
};

describe("tenant message templates", () => {
  it("uses the built-in wording until the resort writes its own", async () => {
    const text = await templates().render(fx.resortId, "booking_confirmed", data);
    expect(text).toContain("BK-00042");
    expect(text).toContain("Sky Eco Resort");
  });

  it("uses the resort's own wording once they have written it", async () => {
    await templates().save(admin, fx.resortId, "booking_confirmed", {
      body: "{resort}: আপনার বুকিং {code} নিশ্চিত হয়েছে। {checkin} তারিখে দেখা হবে।",
    });

    const text = await templates().render(fx.resortId, "booking_confirmed", data);

    expect(text).toContain("আপনার বুকিং BK-00042 নিশ্চিত");
    expect(text).not.toContain("CONFIRMED");
  });

  it("never lets one resort's wording reach another resort's guest", async () => {
    const other = await seedResort(prisma as unknown as PrismaClient);
    await templates().save(admin, fx.resortId, "booking_confirmed", { body: "Ours: {code}" });

    const mine = await templates().render(fx.resortId, "booking_confirmed", data);
    const theirs = await templates().render(other.resortId, "booking_confirmed", data);

    expect(mine).toBe("Ours: BK-00042");
    expect(theirs).not.toContain("Ours:");
  });

  it("refuses a placeholder the message will never be given", async () => {
    await expect(
      templates().save(admin, fx.resortId, "booking_confirmed", { body: "Hi {guestFirstName}" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses to let a resort rewrite the platform's own billing notices", async () => {
    await expect(
      templates().save(admin, fx.resortId, "subscription_suspended" as never, { body: "all is well" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("hands back the built-in wording as the starting point for editing", async () => {
    const list = await templates().list(admin, fx.resortId);
    const confirmed = list.find((t) => t.name === "booking_confirmed")!;
    expect(confirmed.custom).toBe(false);
    expect(confirmed.body).toContain("{code}");
    expect(confirmed.placeholders).toContain("code");
  });

  it("lets a resort go back to the built-in wording", async () => {
    await templates().save(admin, fx.resortId, "booking_confirmed", { body: "Ours: {code}" });
    await templates().reset(admin, fx.resortId, "booking_confirmed");

    const text = await templates().render(fx.resortId, "booking_confirmed", data);
    expect(text).not.toContain("Ours:");
  });

  it("is gated on managing settings, not on being able to see a booking", async () => {
    const role = await prisma.customRole.create({
      data: { resortId: fx.resortId, name: "Desk", permissions: ["bookings.view"] as never },
    });
    const clerk = await prisma.user.create({
      data: { name: "Clerk", phone: `88097${Date.now() % 1e7}`, role: "FRONT_DESK" },
    });
    await prisma.userResort.create({ data: { userId: clerk.id, resortId: fx.resortId, roleId: role.id } });

    await expect(
      templates().save(
        { userId: clerk.id, role: ROLE.FRONT_DESK, resortIds: [fx.resortId] },
        fx.resortId,
        "booking_confirmed",
        { body: "hi {code}" },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("the dispatcher uses them", () => {
  it("sends the resort's own wording, not the built-in one", async () => {
    await templates().save(admin, fx.resortId, "booking_confirmed", {
      body: "{resort}: বুকিং {code} নিশ্চিত। বাকি {due} টাকা।",
    });
    const booking = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-09-04",
      checkOut: "2026-09-06",
      unitPrice: 5000,
    });

    const notifications = makeNotificationsService(asPrismaService);
    await notifications.notifyBooking(booking.id, "booking_confirmed");
    await notifications.tick();

    const job = await prisma.notificationJob.findFirst({ where: { template: "booking_confirmed" } });
    expect(job!.resortId).toBe(fx.resortId);
    expect(job!.renderedText).toContain("বুকিং BK");
    expect(job!.renderedText).not.toContain("CONFIRMED");
  });

  it("falls back to the built-in wording for a resort that has written none", async () => {
    const booking = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-09-04",
      checkOut: "2026-09-06",
    });
    const notifications = makeNotificationsService(asPrismaService);
    await notifications.notifyBooking(booking.id, "booking_confirmed");
    await notifications.tick();

    const job = await prisma.notificationJob.findFirst({ where: { template: "booking_confirmed" } });
    expect(job!.renderedText).toContain("CONFIRMED");
  });
});
