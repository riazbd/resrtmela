/**
 * What an agency sells: a tree of what a tour is made of, and packages built
 * from it.
 *
 * An agency does not sell rooms alone. It sells a trip — transport, food,
 * guides, tickets — and every agency buys a different list of those. So the
 * platform ships no categories at all: the agency writes its own tree, to
 * whatever depth it needs (Transport → Bus → AC), and builds packages by
 * picking leaves off it and pricing them.
 *
 * Two rules the tests below pin down:
 *
 * 1. **A tree that loses a branch loses the packages sold from it.** So a
 *    category with children, or with a package line still pointing at it, is
 *    not deletable — refusing is the only honest answer.
 * 2. **Cost sits beside price on every line.** An agency that cannot see its
 *    own margin at the moment it quotes will find out after the trip.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@rh/db";
import { testPrisma, resetDb, seedResort, type Fixture } from "../helpers/db";
import { makePlatformService, makeAgentService, makeToursService } from "../helpers/services";
import type { PrismaService } from "../../src/prisma/prisma.service";
import { ROLE, type JwtClaims } from "@rh/shared";

const prisma = testPrisma();
const asPrismaService = prisma as unknown as PrismaService;
let fx: Fixture;
let agency: JwtClaims;

const tours = () => makeToursService(asPrismaService);
const agents = () => makeAgentService(asPrismaService);
const platform = () => makePlatformService(asPrismaService);

beforeEach(async () => {
  await resetDb(prisma as unknown as PrismaClient);
  fx = await seedResort(prisma as unknown as PrismaClient);
  agency = { userId: fx.agentId, role: ROLE.AGENT, resortIds: [fx.resortId] };
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function hire(name: string, permissions: string[]) {
  const staff = await platform().createAgentStaff(agency, {
    name,
    email: `${name.toLowerCase().replace(/\W/g, "")}@example.com`,
    password: "password123",
  });
  const role = await agents().createRole(agency, { name: `${name} role`, permissions });
  await agents().assignRole(agency, staff.id, role.id);
  return { userId: staff.id, role: ROLE.AGENT, resortIds: [fx.resortId] } as JwtClaims;
}

/** Transport → Bus → AC, the example the agency described in its own words. */
async function transportTree() {
  const transport = await tours().createCategory(agency, { name: "Transport" });
  const bus = await tours().createCategory(agency, { name: "Bus", parentId: transport.id });
  const ac = await tours().createCategory(agency, { name: "AC", parentId: bus.id });
  return { transport, bus, ac };
}

describe("the agency's own tree", () => {
  it("nests as deep as the agency needs", async () => {
    await transportTree();

    const tree = await tours().categories(agency);

    expect(tree).toHaveLength(1);
    expect(tree[0]!.name).toBe("Transport");
    expect(tree[0]!.children[0]!.name).toBe("Bus");
    expect(tree[0]!.children[0]!.children[0]!.name).toBe("AC");
  });

  it("starts empty, because no two agencies buy the same things", async () => {
    expect(await tours().categories(agency)).toEqual([]);
  });

  it("refuses two siblings with the same name", async () => {
    const { bus } = await transportTree();
    await tours().createCategory(agency, { name: "Non-AC", parentId: bus.id });

    await expect(tours().createCategory(agency, { name: "AC", parentId: bus.id })).rejects.toThrow(
      /already/i,
    );
  });

  it("allows the same name under different parents", async () => {
    const { bus } = await transportTree();
    const train = await tours().createCategory(agency, { name: "Train", parentId: bus.parentId! });

    const ac = await tours().createCategory(agency, { name: "AC", parentId: train.id });

    expect(ac.name).toBe("AC");
  });

  it("refuses two roots with the same name, which MySQL would not catch", async () => {
    await tours().createCategory(agency, { name: "Food" });

    await expect(tours().createCategory(agency, { name: "Food" })).rejects.toThrow(/already/i);
  });

  it("will not delete a branch that still has children under it", async () => {
    const { bus } = await transportTree();

    await expect(tours().deleteCategory(agency, bus.id)).rejects.toThrow(/AC/);
  });

  it("deletes a leaf", async () => {
    const { ac } = await transportTree();

    await tours().deleteCategory(agency, ac.id);

    const tree = await tours().categories(agency);
    expect(tree[0]!.children[0]!.children).toEqual([]);
  });

  it("shows an agency only its own tree", async () => {
    await transportTree();
    const other = await prisma.user.create({
      data: { name: "Other Agency", phone: `8809${Date.now() % 100000000}`, role: "AGENT" },
    });

    const theirs = await tours().categories({ userId: other.id, role: ROLE.AGENT, resortIds: [] });

    expect(theirs).toEqual([]);
  });
});

describe("packages", () => {
  it("prices a package from the lines, and shows the margin", async () => {
    const { ac } = await transportTree();

    const pkg = await tours().createPackage(agency, {
      name: "Sajek 2 nights",
      days: 3,
      nights: 2,
      pax: 4,
      items: [
        { categoryId: ac.id, label: "AC bus, Dhaka–Khagrachari return", qty: 4, unitCost: 1200, unitPrice: 1600 },
        { label: "Breakfast x3", qty: 4, unitCost: 450, unitPrice: 600 },
      ],
    });

    const view = await tours().package(agency, pkg.id);
    expect(view.totals).toEqual({ cost: 6600, price: 8800, margin: 2200 });
    expect(view.items).toHaveLength(2);
  });

  it("keeps a package whose category was deleted", async () => {
    const food = await tours().createCategory(agency, { name: "Food" });
    const pkg = await tours().createPackage(agency, {
      name: "Day trip",
      items: [{ categoryId: food.id, label: "Lunch", qty: 2, unitCost: 300, unitPrice: 400 }],
    });

    // the line is what was sold; only the label survives, and that is enough
    await prisma.tourPackageItem.updateMany({ where: { packageId: pkg.id }, data: { categoryId: null } });
    await tours().deleteCategory(agency, food.id);

    const view = await tours().package(agency, pkg.id);
    expect(view.items[0]!.label).toBe("Lunch");
    expect(view.totals.price).toBe(800);
  });

  it("refuses to delete a category a package still points at", async () => {
    const food = await tours().createCategory(agency, { name: "Food" });
    await tours().createPackage(agency, {
      name: "Day trip",
      items: [{ categoryId: food.id, label: "Lunch", qty: 1, unitCost: 300, unitPrice: 400 }],
    });

    await expect(tours().deleteCategory(agency, food.id)).rejects.toThrow(/package/i);
  });

  it("replaces the lines when a package is edited, rather than adding to them", async () => {
    const pkg = await tours().createPackage(agency, {
      name: "Draft",
      items: [{ label: "Bus", qty: 1, unitCost: 100, unitPrice: 200 }],
    });

    await tours().updatePackage(agency, pkg.id, {
      name: "Final",
      items: [{ label: "Train", qty: 2, unitCost: 300, unitPrice: 500 }],
    });

    const view = await tours().package(agency, pkg.id);
    expect(view.name).toBe("Final");
    expect(view.items.map((i) => i.label)).toEqual(["Train"]);
    expect(view.totals.price).toBe(1000);
  });

  it("never hands one agency another's package", async () => {
    const pkg = await tours().createPackage(agency, { name: "Mine", items: [] });
    const other = await prisma.user.create({
      data: { name: "Other Agency 2", phone: `8810${Date.now() % 100000000}`, role: "AGENT" },
    });

    await expect(
      tours().package({ userId: other.id, role: ROLE.AGENT, resortIds: [] }, pkg.id),
    ).rejects.toThrow(/not your/i);
  });
});

describe("who may build them", () => {
  it("refuses a staff member without the permission", async () => {
    const junior = await hire("Junior", ["agent.book"]);

    await expect(tours().createCategory(junior, { name: "Transport" })).rejects.toThrow(
      /agent\.tours\.manage/,
    );
  });

  it("lets a staff member with the permission build them", async () => {
    const planner = await hire("Planner", ["agent.tours.manage"]);

    const cat = await tours().createCategory(planner, { name: "Transport" });

    expect(cat.name).toBe("Transport");
    // and it belongs to the agency, not to the person who typed it
    const row = await prisma.tourCategory.findUnique({ where: { id: cat.id } });
    expect(row!.agencyId).toBe(fx.agentId);
  });

  it("is closed to the resort's own staff entirely", async () => {
    const manager: JwtClaims = { userId: fx.managerId, role: ROLE.MANAGER, resortIds: [fx.resortId] };

    await expect(tours().categories(manager)).rejects.toThrow(/agents only/i);
  });
});

describe("replaying the same package twice", () => {
  it("stores one package when an offline device sends its write twice", async () => {
    const body = { name: "Sajek 2 nights", items: [], clientRef: "device-a-1" };

    const first = await tours().createPackage(agency, body);
    const second = await tours().createPackage(agency, body);

    expect(second.id).toBe(first.id);
    expect(await prisma.tourPackage.count({ where: { agencyId: fx.agentId } })).toBe(1);
  });
});
