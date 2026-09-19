/**
 * Rooms read in the order a person counts them (2026-09-19).
 *
 * A room's name is one string — "3 Snow Drop", "12 Orchid" — and every list of
 * them was sorted as text. Text puts "12" before "2", and the rooms screen
 * additionally grouped by room type first, so the inventory read 3, 4, 5, 6, 7,
 * 8, 1, 2. A clerk looking for room 2 has to read the whole list.
 *
 * The rule the resort actually uses: numbers first and in number order, then
 * anything named rather than numbered, alphabetically. Compared chunk by chunk
 * so it also holds inside a name — "Block A 2" before "Block A 10".
 *
 * Pure and shared, because the API sorts the lists and the console sorts the
 * room names inside a booking row, and the two disagreeing is a bug nobody
 * reports — it just looks untidy in one place.
 */
import { describe, expect, it } from "vitest";
import { compareRoomNames, byRoomName } from "../src/room-order";

const sorted = (names: string[]) => [...names].sort(compareRoomNames);

describe("rooms in the order a person counts them", () => {
  it("counts, rather than spells, the numbers", () => {
    expect(sorted(["10 Orchid", "2 Lunaria", "1 Camellia"])).toEqual([
      "1 Camellia",
      "2 Lunaria",
      "10 Orchid",
    ]);
  });

  it("puts every numbered room before every named one", () => {
    expect(sorted(["Annex", "3 Snow Drop", "Cottage", "1 Camellia"])).toEqual([
      "1 Camellia",
      "3 Snow Drop",
      "Annex",
      "Cottage",
    ]);
  });

  it("orders the named ones alphabetically, whatever their capitals", () => {
    expect(sorted(["cottage", "Annex", "Bungalow"])).toEqual(["Annex", "Bungalow", "cottage"]);
  });

  it("breaks a tie on the number with the name beside it", () => {
    expect(sorted(["3 Snow Drop", "3 Cherry Blossom"])).toEqual(["3 Cherry Blossom", "3 Snow Drop"]);
  });

  it("counts a number wherever it appears in the name, not only at the front", () => {
    expect(sorted(["Block A 10", "Block A 2"])).toEqual(["Block A 2", "Block A 10"]);
  });

  /**
   * "07" and "7" are the same room typed twice, and which of the two comes
   * first is arbitrary. What is not arbitrary is that the answer never
   * changes: an order that reshuffles between two reads looks like data moving
   * on its own.
   */
  it("keeps a padded spelling next to its twin, in a fixed order", () => {
    expect(sorted(["07 Kath Golap", "7 Kath Golap"])).toEqual(["7 Kath Golap", "07 Kath Golap"]);
    expect(sorted(["7 Kath Golap", "07 Kath Golap"])).toEqual(["7 Kath Golap", "07 Kath Golap"]);
  });

  it("puts the resort's own rooms in the order it wrote them on the wall", () => {
    const asTheyCame = [
      "3 Snow Drop", "4 Cherry Blossom", "5 Margarita", "6 Lavender",
      "7 Kath Golap", "8 Jasmine", "1 Camellia", "2 Lunaria",
    ];
    expect(sorted(asTheyCame)).toEqual([
      "1 Camellia", "2 Lunaria", "3 Snow Drop", "4 Cherry Blossom",
      "5 Margarita", "6 Lavender", "7 Kath Golap", "8 Jasmine",
    ]);
  });

  it("says nothing about two rooms with the same name, so a sort stays stable", () => {
    expect(compareRoomNames("3 Snow Drop", "3 Snow Drop")).toBe(0);
  });

  it("survives a name that is only a number, or empty", () => {
    expect(sorted(["10", "2", ""])).toEqual(["", "2", "10"]);
  });
});

describe("sorting the rows themselves", () => {
  it("orders anything that carries a name", () => {
    const rooms = [{ id: 9, name: "10 Orchid" }, { id: 1, name: "2 Lunaria" }];
    expect([...rooms].sort(byRoomName).map((r) => r.id)).toEqual([1, 9]);
  });

  it("reads a name through whatever the caller says holds it", () => {
    const items = [{ room: { name: "10 Orchid" } }, { room: { name: "2 Lunaria" } }];
    const order = [...items].sort(byRoomName((i) => i.room.name));
    expect(order.map((i) => i.room.name)).toEqual(["2 Lunaria", "10 Orchid"]);
  });
});
