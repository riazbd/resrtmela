/**
 * The wallet is the agency's account **with the platform**, and nothing else.
 *
 * What an agency owes a resort — the rent on a booking, the commission on it —
 * is between those two. The platform is the medium they meet through, not a
 * party to it. So none of that money belongs in the wallet, and the wallet had
 * been carrying it in two ways at once:
 *
 * - **`payFromWallet` settled a resort's booking out of it.** Nothing in the
 *   console called it, and no test covered it, which is the only reason it
 *   never took money from anyone: it passed `-Math.abs(amount)` to a function
 *   that threw the sign away for every kind but PAYOUT and ADJUST, so paying a
 *   booking marked the stay paid **and increased the agent's balance**.
 * - **`RESORT_ADMIN` could move it and read it.** Any resort an agent sold
 *   could top the wallet up, drain it, and read every movement in it — the
 *   top-ups other resorts had made and the bookings the agency had sold
 *   elsewhere. The resort down the road sells to the same agencies.
 *
 * What is left is the account that really is with the platform: money handed
 * over, money handed back, and a correction. `Wallet.userId` is unique, which
 * was always right — an agency selling four resorts has one account with the
 * platform, not four.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, seedBooking, type Fixture } from "../helpers/db";
import { makePlatformService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, ALL_PERMISSIONS, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrisma = prisma as unknown as PrismaService;
let fx: Fixture;
let platform: JwtClaims;
let resortOwner: JwtClaims;
let agent: JwtClaims;

const svc = () => makePlatformService(asPrisma);

const balanceOf = async (userId: number) =>
  Number((await prisma.wallet.findUnique({ where: { userId } }))?.balance ?? 0);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  const su = await prisma.user.create({
    data: { name: "Platform", phone: `8896${Math.floor(Math.random() * 1e8)}`, email: `8896${Math.floor(Math.random() * 1e8)}@example.com`, role: "SUPER_ADMIN" },
  });
  platform = { userId: su.id, role: ROLE.SUPER_ADMIN, resortIds: [] };
  resortOwner = { userId: fx.managerId, role: ROLE.RESORT_ADMIN, resortIds: [fx.resortId] };
  agent = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("whose account it is", () => {
  it("lets the platform put money in", async () => {
    await svc().walletTxn(platform, fx.agentId, "TOPUP", 10_000, "bKash 8X2K1M");

    expect(await balanceOf(fx.agentId)).toBe(10_000);
  });

  it("does not let a resort put money in", async () => {
    await expect(
      svc().walletTxn(resortOwner, fx.agentId, "TOPUP", 10_000),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("does not let a resort take money out", async () => {
    await svc().walletTxn(platform, fx.agentId, "TOPUP", 10_000);

    await expect(
      svc().walletTxn(resortOwner, fx.agentId, "PAYOUT", 5_000),
    ).rejects.toMatchObject({ status: 403 });
    expect(await balanceOf(fx.agentId)).toBe(10_000);
  });

  it("does not let a resort read the statement", async () => {
    // the leak: every top-up and every movement, across every resort the
    // agency sells, on a page a competitor's owner could open
    await expect(
      svc().getWallet(resortOwner, fx.agentId),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("lets the agency read its own", async () => {
    await svc().walletTxn(platform, fx.agentId, "TOPUP", 2_500);

    const view = await svc().getWallet(agent, fx.agentId);

    expect(view.balance).toBe(2_500);
    expect(view.txns).toHaveLength(1);
  });

  it("lets the platform read anyone's", async () => {
    const view = await svc().getWallet(platform, fx.agentId);

    expect(view.balance).toBe(0);
  });

  it("does not let one resort freeze money the agency holds with the platform", async () => {
    await svc().walletTxn(platform, fx.agentId, "TOPUP", 10_000);

    // the resort is entitled to stop this agent selling *its* rooms
    await svc().setAgentStatus(resortOwner, fx.resortId, fx.agentId, "suspended");

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: fx.agentId } });
    expect(wallet.active).toBe(true);
    expect(Number(wallet.balance)).toBe(10_000);
  });
});

describe("what may be in it", () => {
  it("takes money in and pays it back out", async () => {
    await svc().walletTxn(platform, fx.agentId, "TOPUP", 10_000);

    await svc().walletTxn(platform, fx.agentId, "PAYOUT", 4_000, "returned by bKash");

    expect(await balanceOf(fx.agentId)).toBe(6_000);
  });

  it("corrects a mistake in either direction", async () => {
    await svc().walletTxn(platform, fx.agentId, "TOPUP", 10_000);

    await svc().walletTxn(platform, fx.agentId, "ADJUST", -1_500, "double-counted a bKash");

    expect(await balanceOf(fx.agentId)).toBe(8_500);
  });

  it("refuses a movement that is between the agency and a resort", async () => {
    await svc().walletTxn(platform, fx.agentId, "TOPUP", 10_000);

    // what an agency owes a resort, and the commission it earns from one, are
    // theirs to settle. The platform is the medium, not a party.
    await expect(
      svc().walletTxn(platform, fx.agentId, "BOOKING_HOLD" as never, 5_000),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      svc().walletTxn(platform, fx.agentId, "COMMISSION" as never, 500),
    ).rejects.toMatchObject({ status: 400 });
    expect(await balanceOf(fx.agentId)).toBe(10_000);
  });

  it("refuses a payout larger than the balance", async () => {
    await svc().walletTxn(platform, fx.agentId, "TOPUP", 1_000);

    await expect(
      svc().walletTxn(platform, fx.agentId, "PAYOUT", 5_000),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("has no way at all to settle a booking from it", async () => {
    // `payFromWallet` is gone rather than corrected: a booking due is money
    // between the agency and the resort, and routing it through the platform's
    // ledger is what made it wrong, not the arithmetic that did it backwards.
    expect((svc() as unknown as Record<string, unknown>).payFromWallet).toBeUndefined();
  });

  it("leaves a booking's money where it belongs when the wallet moves", async () => {
    await svc().walletTxn(platform, fx.agentId, "TOPUP", 10_000);
    const booking = await seedBooking(prisma as unknown as PrismaClient, fx, {
      checkIn: "2026-12-01", checkOut: "2026-12-03", unitPrice: 5000,
    });
    await prisma.booking.update({ where: { id: booking.id }, data: { agentUserId: fx.agentId } });

    await svc().walletTxn(platform, fx.agentId, "PAYOUT", 10_000);

    // the stay is still owed to the resort in full
    expect(await prisma.payment.count({ where: { bookingId: booking.id } })).toBe(0);
  });
});

describe("the resort's permission matrix", () => {
  it("offers no box for a wallet a resort cannot touch", () => {
    // `wallet.view` ("View agent wallets") and `wallet.manage` ("Top-up /
    // payout wallets") were resort-scoped keys for money a resort is not a
    // party to. A box that decides nothing reads as control and is not.
    expect(ALL_PERMISSIONS).not.toContain("wallet.view");
    expect(ALL_PERMISSIONS).not.toContain("wallet.manage");
  });

  it("still lets an agency see its own account", () => {
    expect(ALL_PERMISSIONS).toContain("agent.wallet.view");
  });
});

describe("the record of it", () => {
  it("writes down how the money arrived", async () => {
    await svc().walletTxn(platform, fx.agentId, "TOPUP", 10_000, "bKash TrxID 8X2K1M");

    const txn = await prisma.walletTxn.findFirstOrThrow({ orderBy: { id: "desc" } });
    expect(txn.note).toMatch(/8X2K1M/);
    const logged = await prisma.auditLog.findFirst({ where: { action: "wallet.topup" } });
    expect(logged).not.toBeNull();
  });

  it("keeps a running balance on every line", async () => {
    await svc().walletTxn(platform, fx.agentId, "TOPUP", 10_000);
    await svc().walletTxn(platform, fx.agentId, "PAYOUT", 2_500);

    const txns = await prisma.walletTxn.findMany({ orderBy: { id: "asc" } });
    expect(txns.map((t) => Number(t.balanceAfter))).toEqual([10_000, 7_500]);
  });
});
