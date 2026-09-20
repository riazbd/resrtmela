/**
 * The desk's routes, typed once (2026-09-20).
 *
 * Phase 1 of the app is the fifteen screens a resort's front desk lives in:
 * the day sheet, the calendar, the booking list and its detail, the three
 * ways of making a booking, check-in, check-out, taking a payment, the dues
 * list, the stay bill and the edit form. §0.3 of the design says each phase's
 * first commit adds exactly the routes that phase's screens call and ports the
 * console onto them in the same commit, so this spec is that phase's gate.
 *
 * Writing it turned up four things the client already had wrong, which is the
 * argument for the rule rather than an aside:
 *
 *   - `bookings.checkout` posted to `/bookings/:id/checkout`. There is no such
 *     route and there never has been — checking out is a transition. Nobody
 *     called it, so nobody found out.
 *   - `bookings.pay` promised a `BookingDetail`. `POST /bookings/:id/payments`
 *     answers `{ payment, booking, replayed }`, and the `replayed` flag is the
 *     whole point of the offline queue's `clientRef`.
 *   - `today` returned `unknown`, so the dashboard cast it to a locally
 *     declared shape whose rows claimed to be `BookingRow`s. They are not:
 *     they carry `arriving`/`departing` and no dates at all.
 *   - `createGroup` promised `BookingDetail[]`. The route sends a group tag, a
 *     count, and an id and code per room.
 *
 * Written against `apps/api/src/bookings/bookings.controller.ts`,
 * `payments.controller.ts` and the one desk route that lives in
 * `platform.controller.ts`. Re-read those if one of these goes red.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApiClient, paths } from "../src/index";

interface Sent {
  path: string;
  method: string;
  body: unknown;
}

function recording() {
  const sent: Sent[] = [];
  const client = createApiClient(async <T,>(
    path: string,
    opts?: { method?: string; body?: unknown },
  ): Promise<T> => {
    sent.push({ path, method: opts?.method ?? "GET", body: opts?.body });
    return {} as T;
  });
  return { client, sent, last: () => sent[sent.length - 1]! };
}

describe("pricing a stay before it exists", () => {
  /**
   * The form asks what a stay will cost while the clerk is still choosing
   * rooms, so the quote carries no guest. The console has posted this by hand
   * since the day the route was written.
   */
  it("posts the rooms, the dates and the people, and nothing else", async () => {
    const { client, last } = recording();
    await client.bookings.quote({
      resortId: 3,
      roomIds: [11, 12],
      checkIn: "2026-10-01",
      checkOut: "2026-10-03",
      adults: 4,
      children: 1,
    });
    expect(last()).toEqual({
      path: "/bookings/quote",
      method: "POST",
      body: {
        resortId: 3,
        roomIds: [11, 12],
        checkIn: "2026-10-01",
        checkOut: "2026-10-03",
        adults: 4,
        children: 1,
      },
    });
  });
});

describe("what the desk does to a stay in progress", () => {
  it("sets how many extra people are in the room", async () => {
    const { client, last } = recording();
    await client.bookings.extraPersons(41, 2);
    expect(last()).toEqual({
      path: "/bookings/41/extra-persons",
      method: "POST",
      body: { persons: 2 },
    });
  });

  it("adds a charge to the bill", async () => {
    const { client, last } = recording();
    await client.bookings.addCharge(41, {
      kind: "DAMAGE",
      label: "Broken lamp",
      amount: 1200,
      qty: 1,
    });
    expect(last()).toEqual({
      path: "/bookings/41/charges",
      method: "POST",
      body: { kind: "DAMAGE", label: "Broken lamp", amount: 1200, qty: 1 },
    });
  });

  it("takes a charge back off by the line's own id", async () => {
    const { client, last } = recording();
    await client.bookings.removeCharge(41, 907);
    expect(last()).toEqual({
      path: "/bookings/41/charges/907",
      method: "DELETE",
      body: undefined,
    });
  });

  it("lets the platform approve an agent's late payment", async () => {
    const { client, last } = recording();
    await client.bookings.approveLate(41);
    expect(last()).toEqual({
      path: "/bookings/41/approve-late",
      method: "POST",
      body: undefined,
    });
  });
});

/**
 * A receipt, not a booking.
 *
 * `clientRef` is what makes the offline queue safe to replay: the second
 * arrival of the same write is answered with the original payment and
 * `replayed: true`, never with a second receipt. A caller that only got a
 * `BookingDetail` back could not tell the difference, and the phone is the
 * client that will need to.
 */
describe("taking a payment", () => {
  it("carries the identity of the write, so a replay is not a second receipt", async () => {
    const { client, last } = recording();
    await client.bookings.pay(41, {
      amount: 5000,
      method: "BKASH",
      clientRef: "outbox-7f3a",
    });
    expect(last()).toEqual({
      path: "/bookings/41/payments",
      method: "POST",
      body: { amount: 5000, method: "BKASH", clientRef: "outbox-7f3a" },
    });
  });

  it("answers with the payment, the booking it changed, and whether it had already happened", async () => {
    const client = createApiClient(async <T,>(): Promise<T> =>
      ({
        payment: { id: 5, amount: 5000, method: "BKASH", type: "FINAL" },
        booking: { id: 41, code: "SKY-0041" },
        replayed: true,
      }) as T);
    const receipt = await client.bookings.pay(41, { amount: 5000, method: "BKASH" });
    expect(receipt.replayed).toBe(true);
    expect(receipt.payment.amount).toBe(5000);
    expect(receipt.booking.code).toBe("SKY-0041");
  });
});

/**
 * A tour group is answered with a tag, not with bookings.
 *
 * The client promised `BookingDetail[]` and the route has only ever sent an
 * id and a code per room. The console read `groupTag` off it anyway, through
 * a hand-written call with a hand-written shape — which is the same fact
 * twice, in two places, and only one of them compiled.
 */
describe("making a tour group", () => {
  it("answers with the tag to find them all by and the codes to read out", async () => {
    const client = createApiClient(async <T,>(): Promise<T> =>
      ({
        groupTag: "G-0007",
        count: 2,
        bookings: [{ id: 41, code: "SKY-0041" }, { id: 42, code: "SKY-0042" }],
      }) as T);
    const made = await client.bookings.createGroup({
      resortId: 3,
      roomIds: [11, 12],
      checkIn: "2026-10-01",
      checkOut: "2026-10-03",
      guest: { fullName: "Nasrin Akter" },
      adults: 4,
    });
    expect(made.groupTag).toBe("G-0007");
    expect(made.count).toBe(2);
    expect(made.bookings.map((b) => b.code)).toEqual(["SKY-0041", "SKY-0042"]);
  });
});

/**
 * The dashboard's own read.
 *
 * Its rows are not bookings. They say whether the stay is arriving or
 * departing today, they carry a guest with no id, and they have no dates on
 * them — the day is the question, so the answer does not repeat it.
 */
describe("the day in one screen", () => {
  it("answers with arrivals, departures, occupancy and what is owed", async () => {
    const client = createApiClient(async <T,>(): Promise<T> =>
      ({
        arrivals: [
          {
            id: 41,
            code: "SKY-0041",
            arriving: true,
            departing: false,
            guest: { fullName: "Rafiq Hasan", phone: "01811110001" },
            agent: null,
            rooms: ["1 Camellia"],
            state: "CONFIRMED",
            rent: 9000,
            paid: 5000,
            due: 4000,
          },
        ],
        departures: [],
        occupancyPct: 40,
        duesTotal: 4000,
        duesCount: 1,
      }) as T);
    const feed = await client.today(3);
    expect(feed.occupancyPct).toBe(40);
    expect(feed.duesCount).toBe(1);
    expect(feed.arrivals[0]!.arriving).toBe(true);
    expect(feed.arrivals[0]!.guest.fullName).toBe("Rafiq Hasan");
    expect(feed.departures).toEqual([]);
  });
});

/**
 * The rule, checked rather than trusted.
 *
 * Every path this group can emit is matched against the routes the API's own
 * controllers declare. A method that points nowhere fails here — which is how
 * `checkout` should have been caught, and how the next one will be.
 */
describe("every desk route the client knows exists on the server", () => {
  const CONTROLLERS = [
    "apps/api/src/bookings/bookings.controller.ts",
    "apps/api/src/payments/payments.controller.ts",
    "apps/api/src/platform/platform.controller.ts",
    // phase 2's slices, added the day each group was typed
    "apps/api/src/fb/fb.controller.ts",
    "apps/api/src/activities/activities.controller.ts",
    "apps/api/src/payroll/payroll.controller.ts",
  ];

  /** `@Post("bookings/:id/charges")` becomes a test for `/bookings/41/charges`. */
  function declaredRoutes(): { method: string; test: (path: string) => boolean }[] {
    const root = join(__dirname, "..", "..", "..");
    const out: { method: string; test: (path: string) => boolean }[] = [];
    for (const file of CONTROLLERS) {
      const src = readFileSync(join(root, file), "utf8");
      for (const m of src.matchAll(/@(Get|Post|Patch|Delete|Put)\(\s*"([^"]*)"\s*\)/g)) {
        const pattern = new RegExp(
          "^/" +
            m[2]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:[A-Za-z]+/g, "[^/]+") +
            "$",
        );
        out.push({ method: m[1]!.toUpperCase(), test: (p) => pattern.test(p) });
      }
    }
    return out;
  }

  it("has no method pointing at a route nobody wrote", async () => {
    const { client, sent } = recording();
    await client.bookings.quote({
      resortId: 3, roomIds: [11], checkIn: "2026-10-01", checkOut: "2026-10-02", adults: 2,
    });
    await client.bookings.list({ resortId: 3 });
    await client.bookings.get(41);
    await client.bookings.create({
      resortId: 3, roomIds: [11], checkIn: "2026-10-01", checkOut: "2026-10-02", adults: 2,
    });
    await client.bookings.createGroup({
      resortId: 3, roomIds: [11], checkIn: "2026-10-01", checkOut: "2026-10-02",
      guest: { fullName: "Rafiq Hasan" }, adults: 2,
    });
    await client.bookings.update(41, { adults: 3 });
    await client.bookings.transition(41, "CHECKED_IN");
    await client.bookings.remove(41);
    await client.bookings.removeMany(3, [41]);
    await client.bookings.pay(41, { amount: 100, method: "CASH" });
    await client.bookings.extraPersons(41, 1);
    await client.bookings.addCharge(41, { kind: "SERVICE", label: "Laundry", amount: 300 });
    await client.bookings.removeCharge(41, 907);
    await client.bookings.approveLate(41);
    await client.bookings.invoice(41);
    await client.bookings.generateInvoice(41);
    await client.bookings.emailInvoice(41);
    await client.bookings.cancelRequests(3);
    await client.bookings.requestCancel(41, "plans changed");
    await client.bookings.decideCancel(41, true);
    await client.today(3);

    /**
     * Phase 2's three slices. Activities had no group at all until
     * 2026-09-20 and the console reached all of it by hand, which is
     * exactly the state `checkout` rotted in.
     */
    await client.fb.inHouse(3);
    await client.fb.bills(3, { from: "2026-09-01", to: "2026-09-21" });
    await client.fb.createBill(3, { date: "2026-09-20", items: [] });
    await client.fb.payBill(7, { amount: 100, method: "CASH" });
    await client.fb.removeBill(7);
    await client.fb.packages(3);
    await client.fb.createPackage(3, {});
    await client.fb.updatePackage(5, {});
    await client.fb.removePackage(5);

    await client.activities.list(3);
    await client.activities.create(3, {
      name: "Sunset cruise", category: "TOUR", basePrice: 1200, durationMin: 90,
    });
    await client.activities.update(8, { basePrice: 1400 });
    await client.activities.setSchedules(8, []);
    await client.activities.generate(8, "2026-10-01", "2026-10-31");
    await client.activities.slots(3, 8, { from: "2026-10-01", to: "2026-10-31" });
    await client.activities.removeSlot(99);
    await client.activities.addToBooking(41, { slotId: 99, persons: 2 });
    await client.activities.removeFromBooking(41, 907);

    await client.payroll.employees(3);
    await client.payroll.addEmployee(3, {});
    await client.payroll.updateEmployee(3, 4, {});
    await client.payroll.removeEmployee(3, 4);
    await client.payroll.sheet(3, "2026-09");
    await client.payroll.pay(3, 4, {});
    await client.payroll.unpay(77);
    await client.daySheet(3, "2026-10-01");
    await client.calendar(3, "2026-10-01", "2026-10-31");
    await client.dues(3);
    await client.rooms.availability(3, "2026-10-01", "2026-10-31");

    const routes = declaredRoutes();
    const orphans = sent
      .filter((s) => !routes.some((r) => r.method === s.method && r.test(s.path.split("?")[0]!)))
      .map((s) => `${s.method} ${s.path}`);
    expect(orphans).toEqual([]);
  });

  /**
   * `bookings.cancel` and `bookings.checkout` both point at routes that do not
   * exist. `cancel` is not phase 1's and stays for now; `checkout` is, and a
   * check-out screen built on it would have failed in front of a guest.
   */
  it("no longer offers a check-out that posts nowhere", () => {
    const { client } = recording();
    expect((client.bookings as Record<string, unknown>).checkout).toBeUndefined();
  });
});

/**
 * The addresses a queued write has to carry (2026-09-20).
 *
 * Most writes go through the client and the screen never sees a path. Two
 * cannot: check-in, check-out and taking money may be held until the
 * network returns, and a held write is a row in storage — it has to carry
 * where it was going as data.
 *
 * Both clients wrote those paths out by hand at the call site, which is
 * the same drift `checkout` came from, one door along: the queue's copy
 * and the client's copy are two addresses for one route, and only one of
 * them is checked against the server. So there is one copy, the client
 * posts to it, and this asks that it still does.
 */
describe("the queue and the client agree about where a write goes", () => {
  it("posts a transition to the address the queue would hold", async () => {
    const { client, sent } = recording();
    await client.bookings.transition(41, "CHECKED_IN");
    expect(sent.at(-1)?.path).toBe(paths.bookingTransition(41));
  });

  it("posts a payment to the address the queue would hold", async () => {
    const { client, sent } = recording();
    await client.bookings.pay(41, { amount: 100, method: "CASH" });
    expect(sent.at(-1)?.path).toBe(paths.bookingPayments(41));
  });
});
