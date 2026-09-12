/**
 * Which rooms the booking form lets a clerk pick.
 *
 * The grid greyed out a room whose nights were taken, and nothing else. A room
 * out of service has no taken nights — it is simply not being sold — so it
 * rendered as freely available. The clerk picked it, typed the guest's name,
 * phone, NID and advance, pressed Create, and got back "One or more rooms
 * missing/inactive for this resort", which names no room and suggests nothing.
 *
 * Two different reasons a room cannot be sold tonight, and they need different
 * words: one is booked and may be free next week, the other is shut until
 * somebody fixes it.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RoomAvail } from "@rh/shared";
import { RoomChoice } from "@/app/(app)/bookings/room-choice";

const FREE: RoomAvail = {
  roomId: 1, roomName: "101", roomTypeId: 1, baseRate: 5000, status: "ACTIVE", busyNights: [],
};

const noop = () => {};

describe("the room grid on the booking form", () => {
  it("offers a room that is free", () => {
    render(<RoomChoice room={FREE} checked={false} onToggle={noop} />);
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false);
  });

  it("refuses a room whose nights are taken, and says how many", () => {
    render(
      <RoomChoice room={{ ...FREE, busyNights: ["2026-11-05", "2026-11-06"] }} checked={false} onToggle={noop} />,
    );
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/busy \(2n\)/i)).toBeTruthy();
  });

  it("refuses a room that is out of service", () => {
    render(<RoomChoice room={{ ...FREE, status: "OUT_OF_SERVICE" }} checked={false} onToggle={noop} />);
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
  });

  it("does not call a closed room busy — it is shut, not booked", () => {
    render(<RoomChoice room={{ ...FREE, status: "OUT_OF_SERVICE" }} checked={false} onToggle={noop} />);
    expect(screen.queryByText(/busy/i)).toBeNull();
    expect(screen.getByText(/out of service/i)).toBeTruthy();
  });

  it("shows the agent their own price rather than the rack rate", () => {
    render(<RoomChoice room={{ ...FREE, agentRate: 4500 }} checked={false} onToggle={noop} />);
    expect(screen.getByText(/your price/i)).toBeTruthy();
  });
});
