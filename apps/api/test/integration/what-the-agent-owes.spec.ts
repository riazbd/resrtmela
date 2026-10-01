/**
 * The account between a resort and an agent, end to end.
 *
 * The bug this module replaced was not in the arithmetic — it was that the
 * software offered no way to say what had happened. A resort handed 9,000 by an
 * agent who kept 1,000 could only record "the guest paid 9,000", which left the
 * stay owing exactly the commission for ever and put the Dues screen's
 * per-agency total out by the commission on every agency booking it counted.
 *
 * So the first test here is the one that matters: one form, and the booking
 * comes out paid.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { ROLE, type JwtClaims } from "@rh/shared";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import {
  makeAgentAccountsService,
  makeBookingsService,
  makeMyAccountsService,
  makeSettleService,
  makeTaxService,
} from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { BookingsService } from "../../src/bookings/bookings.service";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;

const accounts = () => makeAgentAccountsService(asPrismaService);
const settle = () => makeSettleService(asPrismaService);
const mine = () => makeMyAccountsService(asPrismaService);

let owner: JwtClaims;
let agent: JwtClaims;

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  await prisma.resort.update({
    where: { id: fx.resortId },
    data: { agentCommissionKind: "PERCENT", agentCommissionRate: 10 },
  });
  owner = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
  agent = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** One agent booking: 2 nights at 5,000 — a 10,000 stay, 1,000 of commission. */
async function agentBooking(unitPrice = 5000) {
  const b = await seedBooking(prisma as unknown as PrismaClient, fx, {
    roomId: fx.rooms[0]!.id,
    checkIn: "2026-08-15",
    checkOut: "2026-08-17",
    unitPrice,
  });
  await prisma.booking.update({
    where: { id: b.id },
    data: { agentUserId: fx.agentId, source: "AGENT", state: "CONFIRMED" },
  });
  return b;
}

/** What is still owed on a stay, by the one arithmetic every screen reads. */
async function dueOn(bookingId: number) {
  const b = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { items: true, payments: true },
  });
  const rules = await makeTaxService(asPrismaService).rulesFor(b.resortId);
  return BookingsService.computeTotals(b as never, rules).due;
}

describe("the door that matters", () => {
  /**
   * The owner's own scenario: *"boro vai, ami amar commission raikha apnare
   * baki ta die ditesi."* One form — 9,000 came in, 1,000 was kept — and the
   * guest's bill is credited with the whole 10,000, because that is what the
   * guest paid.
   */
  it("records what came in and what was kept, and the stay comes out paid", async () => {
    const b = await agentBooking();
    expect(await dueOn(b.id)).toBe(10_000);

    await settle().received(owner, fx.resortId, fx.agentId, {
      amount: 9_000,
      commission: 1_000,
      bookingId: b.id,
      method: "CASH",
    });

    // the bug this replaced: recording only the 9,000 left 1,000 owing for ever
    expect(await dueOn(b.id)).toBe(0);

    const balance = await accounts().balanceOf(fx.resortId, fx.agentId);
    expect(balance.balance).toBe(0);
    expect(balance.collected).toBe(10_000);
    expect(balance.remitted).toBe(9_000);
    expect(balance.commission).toBe(1_000);
  });

  it("marks the payment as collected by the agent, not counted at the desk", async () => {
    const b = await agentBooking();
    await settle().received(owner, fx.resortId, fx.agentId, {
      amount: 9_000,
      commission: 1_000,
      bookingId: b.id,
      method: "CASH",
    });
    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: b.id } });
    expect(payment.collectedByAgentId).toBe(fx.agentId);
    // and who typed it is still recorded, because they are different people
    expect(payment.receivedById).toBe(fx.managerId);
  });

  /** The agent sent the lot. The resort now owes the commission back. */
  it("leaves the resort owing when the agent remits in full", async () => {
    const b = await agentBooking();
    await settle().received(owner, fx.resortId, fx.agentId, {
      amount: 10_000,
      commission: 0,
      bookingId: b.id,
      method: "BKASH",
      trxId: "9F2K1LM",
    });
    await settle().entry(owner, fx.resortId, fx.agentId, {
      kind: "COMMISSION",
      amount: 1_000,
      bookingId: b.id,
    });
    const balance = await accounts().balanceOf(fx.resortId, fx.agentId);
    expect(balance.balance).toBe(-1_000);
    expect(await dueOn(b.id)).toBe(0);
  });

  it("records the commission terms as they read on the day", async () => {
    const b = await agentBooking();
    await settle().received(owner, fx.resortId, fx.agentId, {
      amount: 9_000,
      commission: 1_000,
      bookingId: b.id,
      method: "CASH",
    });
    const line = await prisma.agentAccountEntry.findFirstOrThrow({ where: { kind: "COMMISSION" } });
    expect(line.rateKind).toBe("PERCENT");
    expect(Number(line.rate)).toBe(10);

    // a rate raised afterwards must not restate what was already agreed
    await prisma.resort.update({
      where: { id: fx.resortId },
      data: { agentCommissionRate: 25 },
    });
    const again = await prisma.agentAccountEntry.findFirstOrThrow({ where: { id: line.id } });
    expect(Number(again.rate)).toBe(10);
  });

  /**
   * The rate is a default in a box, never a rule. What two businesses agreed on
   * the telephone is the fact; a ledger that refuses it is a ledger they stop
   * using.
   */
  it("accepts a commission that is not what the terms would give", async () => {
    const b = await agentBooking();
    await settle().received(owner, fx.resortId, fx.agentId, {
      amount: 9_500,
      commission: 500,
      bookingId: b.id,
      method: "CASH",
    });
    const balance = await accounts().balanceOf(fx.resortId, fx.agentId);
    expect(balance.commission).toBe(500);
    expect(balance.balance).toBe(0);
  });

  /** An extra zero is the commonest mistake on this form. */
  it("refuses a figure larger than the stay, with both numbers in the sentence", async () => {
    const b = await agentBooking();
    await expect(
      settle().received(owner, fx.resortId, fx.agentId, {
        amount: 90_000,
        commission: 1_000,
        bookingId: b.id,
        method: "CASH",
      }),
    ).rejects.toThrow(/10,000/);
  });

  it("refuses a stay that is already paid rather than overpaying it", async () => {
    const b = await agentBooking();
    await settle().received(owner, fx.resortId, fx.agentId, {
      amount: 9_000,
      commission: 1_000,
      bookingId: b.id,
      method: "CASH",
    });
    await expect(
      settle().received(owner, fx.resortId, fx.agentId, {
        amount: 500,
        bookingId: b.id,
        method: "CASH",
      }),
    ).rejects.toThrow(/already paid/i);
  });

  /** A month-end settlement is about the account, not about any one stay. */
  it("takes a remittance with no booking at all", async () => {
    await settle().received(owner, fx.resortId, fx.agentId, {
      amount: 40_000,
      method: "BANK",
      trxId: "TRX-99",
    });
    const balance = await accounts().balanceOf(fx.resortId, fx.agentId);
    expect(balance.remitted).toBe(40_000);
    expect(balance.balance).toBe(-40_000);
  });

  /** A replayed form is one settlement, not two. */
  it("answers a replay with the original", async () => {
    const b = await agentBooking();
    const ref = "settle-once";
    await settle().received(owner, fx.resortId, fx.agentId, {
      amount: 9_000,
      commission: 1_000,
      bookingId: b.id,
      method: "CASH",
      clientRef: ref,
    });
    const second = await settle().received(owner, fx.resortId, fx.agentId, {
      amount: 9_000,
      commission: 1_000,
      bookingId: b.id,
      method: "CASH",
      clientRef: ref,
    });
    expect(second.replayed).toBe(true);
    expect(await prisma.payment.count({ where: { bookingId: b.id } })).toBe(1);
  });
});

describe("the agent's own doors", () => {
  /**
   * Guest money handed to an agent used to be outside the system entirely: the
   * agent held it, the booking read unpaid, and the guest was asked again at
   * checkout for money they had handed over a week before.
   */
  it("lets an agent record money the guest gave them", async () => {
    const b = await agentBooking();
    await settle().collect(agent, fx.agentId, b.id, { amount: 5_000, method: "CASH" });

    expect(await dueOn(b.id)).toBe(5_000);
    const balance = await accounts().balanceOf(fx.resortId, fx.agentId);
    // they are holding 5,000 of the resort's money
    expect(balance.collected).toBe(5_000);
    expect(balance.balance).toBe(5_000);
  });

  it("refuses an agent a booking that is not theirs", async () => {
    const other = await seedBooking(prisma as unknown as PrismaClient, fx, {
      roomId: fx.rooms[1]!.id,
      checkIn: "2026-09-01",
      checkOut: "2026-09-02",
      unitPrice: 5000,
    });
    await expect(
      settle().collect(agent, fx.agentId, other.id, { amount: 1_000, method: "CASH" }),
    ).rejects.toThrow(/not your booking/i);
  });

  /**
   * An agency that could confirm its own remittances could reduce what it owes
   * by typing, and then the statement is not a statement.
   */
  it("keeps a declared remittance out of the balance until the resort matches it", async () => {
    const b = await agentBooking();
    await settle().collect(agent, fx.agentId, b.id, { amount: 10_000, method: "CASH" });

    const declared = await settle().declare(agent, fx.agentId, fx.resortId, {
      amount: 9_000,
      method: "BKASH",
      trxId: "8K2L9",
    });
    expect(declared.status).toBe("PENDING");

    let balance = await accounts().balanceOf(fx.resortId, fx.agentId);
    expect(balance.balance).toBe(10_000); // unchanged by the claim
    expect(balance.pending).toBe(9_000);

    await settle().confirm(owner, fx.resortId, declared.id);
    balance = await accounts().balanceOf(fx.resortId, fx.agentId);
    expect(balance.balance).toBe(1_000);
    expect(balance.pending).toBe(0);
  });

  it("lets an agent withdraw a declaration nobody has matched", async () => {
    const declared = await settle().declare(agent, fx.agentId, fx.resortId, {
      amount: 9_000,
      method: "BKASH",
    });
    await settle().withdraw(agent, fx.agentId, declared.id);
    expect(await prisma.agentAccountEntry.count()).toBe(0);
  });

  it("refuses to let an agent withdraw one the resort has confirmed", async () => {
    const declared = await settle().declare(agent, fx.agentId, fx.resortId, {
      amount: 9_000,
      method: "BKASH",
    });
    await settle().confirm(owner, fx.resortId, declared.id);
    await expect(settle().withdraw(agent, fx.agentId, declared.id)).rejects.toThrow(/already confirmed/i);
  });

  it("shows the agency its own side of the same figures", async () => {
    const b = await agentBooking();
    await settle().received(owner, fx.resortId, fx.agentId, {
      amount: 9_000,
      commission: 1_000,
      bookingId: b.id,
      method: "CASH",
    });
    const list = await mine().list(agent);
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]!.resort.id).toBe(fx.resortId);
    expect(list.rows[0]!.balance).toBe(0);
    expect(list.rows[0]!.commission).toBe(1_000);
  });

  it("refuses an agency a statement at a resort it neither sells nor has anything with", async () => {
    const other = await seedResort(prisma as unknown as PrismaClient);
    // the other resort has turned this agency away
    await prisma.resortAgency.create({
      data: { resortId: other.resortId, accountId: fx.agencyId, blocked: true },
    });
    await expect(mine().statement(agent, other.resortId, {})).rejects.toThrow(/no account/i);
  });
});

/**
 * "agent resort ke adv dite pare na?" — an agency putting money with a resort
 * before the stays it will be spent on: a float for the season, a deposit that
 * holds a block of rooms. `ADVANCE` was in the ledger's vocabulary and only the
 * resort could write it; the agency's one door wrote every declaration as a
 * remittance, so a deposit read on both statements as "Handed money to the
 * resort" against stays that did not exist yet.
 */
describe("an agency's advance to a resort", () => {
  it("is declared as an advance, and counts once the resort has matched it", async () => {
    const declared = await settle().declare(agent, fx.agentId, fx.resortId, {
      kind: "ADVANCE",
      amount: 20_000,
      method: "BKASH",
      trxId: "ADV-1",
    });
    expect(declared.status).toBe("PENDING");
    const row = await prisma.agentAccountEntry.findFirstOrThrow();
    expect(row.kind).toBe("ADVANCE");

    let balance = await accounts().balanceOf(fx.resortId, fx.agentId);
    expect(balance.balance).toBe(0);
    expect(balance.pending).toBe(20_000);

    await settle().confirm(owner, fx.resortId, declared.id);
    balance = await accounts().balanceOf(fx.resortId, fx.agentId);
    // the resort is holding 20,000 of the agency's money
    expect(balance.balance).toBe(-20_000);
  });

  it("is netted against the guest money the agency later holds", async () => {
    const declared = await settle().declare(agent, fx.agentId, fx.resortId, {
      kind: "ADVANCE",
      amount: 20_000,
      method: "CASH",
    });
    await settle().confirm(owner, fx.resortId, declared.id);
    const b = await agentBooking();
    await settle().collect(agent, fx.agentId, b.id, { amount: 10_000, method: "CASH" });
    const balance = await accounts().balanceOf(fx.resortId, fx.agentId);
    expect(balance.balance).toBe(-10_000);
  });

  it("can open the account: a resort the agency may sell, before its first booking there", async () => {
    const other = await seedResort(prisma as unknown as PrismaClient);
    const declared = await settle().declare(agent, fx.agentId, other.resortId, {
      kind: "ADVANCE",
      amount: 5_000,
      method: "CASH",
    });
    expect(declared.status).toBe("PENDING");
    // and both sides can now see the account it opened
    const theirs = await mine().statement(agent, other.resortId, {});
    expect(theirs.pending).toBe(5_000);
    const ownerThere: JwtClaims = { userId: other.managerId, role: ROLE.RESORT_ADMIN, resortIds: [other.resortId] };
    const list = await accounts().accounts(ownerThere, other.resortId);
    expect(list.rows.map((r) => r.agencyId)).toContain(fx.agentId);
  });

  it("still says remittance when nothing says otherwise", async () => {
    await settle().declare(agent, fx.agentId, fx.resortId, { amount: 1_000, method: "CASH" });
    expect((await prisma.agentAccountEntry.findFirstOrThrow()).kind).toBe("REMIT");
  });

  /** Commission and adjustments are the resort's to write, never the agency's. */
  it("refuses any other kind from an agency", async () => {
    await expect(
      settle().declare(agent, fx.agentId, fx.resortId, { kind: "COMMISSION", amount: 1_000, method: "CASH" }),
    ).rejects.toThrow(/advance or a remittance/i);
  });
});

describe("the credit limit", () => {
  /** Off unless asked for, so nothing changes for anybody by this existing. */
  it("lets an agent book when no limit is set", async () => {
    const bookings = makeBookingsService(asPrismaService);
    await expect(
      bookings.create(agent, {
        resortId: fx.resortId,
        roomIds: [fx.rooms[0]!.id],
        checkIn: "2026-10-01",
        checkOut: "2026-10-02",
        adults: 2,
        children: 0,
        guest: { fullName: "Limit Guest", phone: "8801711000901" },
      } as never),
    ).resolves.toBeTruthy();
  });

  it("stops an agent who is holding more than the limit, and says both figures", async () => {
    const b = await agentBooking();
    await settle().collect(agent, fx.agentId, b.id, { amount: 10_000, method: "CASH" });
    await settle().setLimit(owner, fx.resortId, fx.agentId, 5_000);

    const bookings = makeBookingsService(asPrismaService);
    await expect(
      bookings.create(agent, {
        resortId: fx.resortId,
        roomIds: [fx.rooms[1]!.id],
        checkIn: "2026-10-01",
        checkOut: "2026-10-02",
        adults: 2,
        children: 0,
        guest: { fullName: "Limit Guest", phone: "8801711000902" },
      } as never),
    ).rejects.toThrow(/5,000/);
  });

  it("lets them book again once they have settled", async () => {
    const b = await agentBooking();
    await settle().collect(agent, fx.agentId, b.id, { amount: 10_000, method: "CASH" });
    await settle().setLimit(owner, fx.resortId, fx.agentId, 5_000);
    await settle().entry(owner, fx.resortId, fx.agentId, {
      kind: "REMIT",
      amount: 10_000,
      method: "CASH",
    });

    const bookings = makeBookingsService(asPrismaService);
    await expect(
      bookings.create(agent, {
        resortId: fx.resortId,
        roomIds: [fx.rooms[1]!.id],
        checkIn: "2026-10-01",
        checkOut: "2026-10-02",
        adults: 2,
        children: 0,
        guest: { fullName: "Limit Guest", phone: "8801711000902" },
      } as never),
    ).resolves.toBeTruthy();
  });
});

describe("who may touch an account", () => {
  it("refuses an agent the resort's list of agencies", async () => {
    await expect(accounts().accounts(agent, fx.resortId)).rejects.toThrow();
  });

  it("refuses an agent the settling form", async () => {
    await expect(
      settle().received(agent, fx.resortId, fx.agentId, { amount: 1_000, method: "CASH" }),
    ).rejects.toThrow();
  });

  it("refuses an agent the credit limit", async () => {
    await expect(settle().setLimit(agent, fx.resortId, fx.agentId, 1_000)).rejects.toThrow();
  });

  /**
   * A method the resort does not take is refused, the same rule every other
   * money screen holds to: the question is per resort, so the check is too.
   */
  it("refuses a payment method this resort has never taken", async () => {
    await expect(
      settle().received(owner, fx.resortId, fx.agentId, { amount: 1_000, method: "PAYPAL" }),
    ).rejects.toThrow();
  });

  it("refuses a kind of line the account does not keep", async () => {
    await expect(
      settle().entry(owner, fx.resortId, fx.agentId, { kind: "COLLECTED", amount: 500 }),
    ).rejects.toThrow(/recorded on the booking/i);
  });

  /**
   * `ADJUSTMENT` runs both ways; nothing else does, so a remittance filed as a
   * positive figure is still a remittance.
   */
  it("pins a remittance to its own direction whatever sign was typed", async () => {
    await settle().entry(owner, fx.resortId, fx.agentId, {
      kind: "REMIT",
      amount: 5_000,
      method: "CASH",
    });
    const line = await prisma.agentAccountEntry.findFirstOrThrow({});
    expect(Number(line.amount)).toBe(-5_000);
  });

  it("keeps an adjustment in whichever direction it was given", async () => {
    await settle().entry(owner, fx.resortId, fx.agentId, { kind: "ADJUSTMENT", amount: -750 });
    const balance = await accounts().balanceOf(fx.resortId, fx.agentId);
    expect(balance.balance).toBe(-750);
  });
});

describe("the resort's list", () => {
  it("shows an agency it has sold through even with nothing settled", async () => {
    await agentBooking();
    const list = await accounts().accounts(owner, fx.resortId);
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]!.bookings).toBe(1);
    expect(list.rows[0]!.balance).toBe(0);
  });

  /**
   * The two sides struck apart, because they are two different telephone calls
   * — one chasing money, one paying it.
   */
  it("keeps what is owed each way in separate figures", async () => {
    const b = await agentBooking();
    await settle().collect(agent, fx.agentId, b.id, { amount: 10_000, method: "CASH" });
    let list = await accounts().accounts(owner, fx.resortId);
    expect(list.owedToResort).toBe(10_000);
    expect(list.owedToAgents).toBe(0);

    await settle().received(owner, fx.resortId, fx.agentId, {
      amount: 11_000,
      method: "CASH",
    });
    list = await accounts().accounts(owner, fx.resortId);
    expect(list.owedToResort).toBe(0);
    expect(list.owedToAgents).toBe(1_000);
  });

  /**
   * The statement's totals are about the account and never about the dates
   * asked for. A figure that quietly meant "of the lines shown for September"
   * is one somebody reconciles against and cannot make balance.
   */
  it("keeps the totals whole when the lines are narrowed to a date range", async () => {
    await settle().entry(owner, fx.resortId, fx.agentId, {
      kind: "REMIT",
      amount: 4_000,
      method: "CASH",
      date: "2026-07-05",
    });
    await settle().entry(owner, fx.resortId, fx.agentId, {
      kind: "REMIT",
      amount: 6_000,
      method: "CASH",
      date: "2026-08-05",
    });
    const august = await accounts().statement(owner, fx.resortId, fx.agentId, {
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(august.rows).toHaveLength(1);
    expect(august.balance).toBe(-10_000);
  });

  it("offers only the methods this resort takes", async () => {
    const s = await accounts().statement(owner, fx.resortId, fx.agentId);
    expect(s.methods.length).toBeGreaterThan(0);
    expect(s.methods.every((m) => typeof m.code === "string" && typeof m.label === "string")).toBe(true);
  });
});
