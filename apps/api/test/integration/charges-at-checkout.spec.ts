/**
 * What a guest owes beyond the room: a service, damage, a fine.
 *
 * Water from the minibar, a broken lamp, a smoking fine — the desk had nowhere
 * to put any of it. The bill was rooms, extra persons, activities and the
 * restaurant, so these went on paper and the paper was not on the invoice.
 *
 * A stay charge is a line on the booking: a kind the platform declared
 * (`STAY_CHARGE_KINDS`), what it was for, and what it costs. It is added while
 * the guests are in, or after they have left and before the invoice is issued —
 * an issued invoice is frozen, and a line that appeared after it would make
 * the paper and the screen disagree.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makeBookingsService, makeReportsService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, STAY_CHARGE_KINDS, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let desk: JwtClaims;

const bookings = () => makeBookingsService(asPrisma);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  desk = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };
});

afterAll(async () => prisma.$disconnect());

/** One night at 5,000, guests in the room. */
async function stayingGuest(opts: { discount?: number } = {}) {
  return seedBooking(prisma as unknown as PrismaClient, fx, {
    checkIn: "2026-08-10",
    checkOut: "2026-08-11",
    state: "CHECKED_IN",
    ...opts,
  });
}

describe("the kinds", () => {
  it("are declared once", () => {
    expect([...STAY_CHARGE_KINDS]).toEqual(["SERVICE", "DAMAGE", "FINE"]);
  });
});

describe("adding a charge", () => {
  it("puts it on the bill and on what is due", async () => {
    const b = await stayingGuest();

    const after = await bookings().addCharge(desk, b.id, { kind: "SERVICE", label: "Mineral water", amount: 40, qty: 3 });

    expect(after.rent).toBe(5120);
    expect(after.due).toBe(5120);
    const line = after.items.find((i) => i.kind === "CHARGE")!;
    expect(line.chargeKind).toBe("SERVICE");
    expect(line.label).toBe("Mineral water");
    expect(line.qty).toBe(3);
  });

  it("keeps damage and fines apart, each with what it was for", async () => {
    const b = await stayingGuest();
    await bookings().addCharge(desk, b.id, { kind: "DAMAGE", label: "Broken bedside lamp", amount: 1500 });

    const after = await bookings().addCharge(desk, b.id, { kind: "FINE", label: "Smoking in the room", amount: 2000 });

    expect(after.rent).toBe(8500);
    expect(after.items.filter((i) => i.kind === "CHARGE").map((i) => i.chargeKind).sort()).toEqual(["DAMAGE", "FINE"]);
  });

  it("is not reduced by the stay's discount percentage", async () => {
    const b = await stayingGuest();
    await prisma.booking.update({
      where: { id: b.id },
      data: { discountKind: "PERCENT", discountValue: 10 as never, discount: 500 as never },
    });

    const after = await bookings().addCharge(desk, b.id, { kind: "DAMAGE", label: "Towel", amount: 600 });

    expect(after.discount).toBe(500);
  });

  it("can be added after checkout, while the invoice is not yet issued", async () => {
    const b = await stayingGuest();
    await bookings().transition(desk, b.id, "CHECKED_OUT");

    const after = await bookings().addCharge(desk, b.id, { kind: "DAMAGE", label: "Stained sheet", amount: 300 });

    expect(after.rent).toBe(5300);
  });

  it("is written down", async () => {
    const b = await stayingGuest();
    await bookings().addCharge(desk, b.id, { kind: "FINE", label: "Late checkout", amount: 1000 });

    const log = await prisma.auditLog.findFirst({ where: { action: "booking.charge.add", entityId: b.id } });
    expect(log).toBeTruthy();
  });

  it("appears on the invoice under its own name", async () => {
    const b = await stayingGuest();
    await bookings().addCharge(desk, b.id, { kind: "DAMAGE", label: "Broken bedside lamp", amount: 1500 });
    await bookings().generateInvoice(desk, b.id);

    const inv = await bookings().invoicePayload(desk, b.id);

    expect(inv.items.map((i) => i.description)).toContain("Damage — Broken bedside lamp");
    expect(inv.total).toBe(6500);
  });

  it("counts in the P&L once it has been paid, and as billed before", async () => {
    const b = await stayingGuest();
    await bookings().addCharge(desk, b.id, { kind: "FINE", label: "Smoking", amount: 2000 });

    const pl = await makeReportsService(asPrisma).pl(desk, fx.resortId, "2026-08-01", "2026-09-01");

    expect(pl.resort.chargesRevenue).toBe(2000);
    expect(pl.resort.billed).toBe(7000);
  });
});

describe("taking one off", () => {
  it("removes it from the bill", async () => {
    const b = await stayingGuest();
    const added = await bookings().addCharge(desk, b.id, { kind: "SERVICE", label: "Laundry", amount: 250 });
    const line = added.items.find((i) => i.kind === "CHARGE")!;

    const after = await bookings().removeCharge(desk, b.id, line.id);

    expect(after.rent).toBe(5000);
  });

  it("will not remove a room", async () => {
    const b = await stayingGuest();

    await expect(bookings().removeCharge(desk, b.id, b.itemId)).rejects.toThrow(/not a charge/i);
  });
});

describe("what it refuses", () => {
  it("a kind nobody declared", async () => {
    const b = await stayingGuest();

    await expect(
      bookings().addCharge(desk, b.id, { kind: "TIP" as never, label: "x", amount: 10 }),
    ).rejects.toThrow(/SERVICE, DAMAGE, FINE/);
  });

  it("a charge with nothing to say what it was for", async () => {
    const b = await stayingGuest();

    await expect(bookings().addCharge(desk, b.id, { kind: "DAMAGE", label: "  ", amount: 10 })).rejects.toThrow(/what/i);
  });

  it("a charge of nothing", async () => {
    const b = await stayingGuest();

    await expect(bookings().addCharge(desk, b.id, { kind: "DAMAGE", label: "Cup", amount: 0 })).rejects.toThrow(/more than zero/i);
  });

  it("a stay that has not started", async () => {
    const b = await seedBooking(prisma as unknown as PrismaClient, fx, { checkIn: "2026-08-10", checkOut: "2026-08-11" });

    await expect(bookings().addCharge(desk, b.id, { kind: "SERVICE", label: "Water", amount: 40 })).rejects.toThrow(/checked in/i);
  });

  it("a stay whose invoice is already issued", async () => {
    const b = await stayingGuest();
    await bookings().generateInvoice(desk, b.id);

    await expect(bookings().addCharge(desk, b.id, { kind: "SERVICE", label: "Water", amount: 40 })).rejects.toThrow(/invoice/i);
  });

  it("an agent", async () => {
    const b = await stayingGuest();
    const agent: JwtClaims = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [fx.resortId] };

    await expect(bookings().addCharge(agent, b.id, { kind: "SERVICE", label: "Water", amount: 40 })).rejects.toThrow();
  });
});
