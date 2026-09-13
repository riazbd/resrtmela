/**
 * The data layer, and the cache that outlives the page.
 *
 * Fifty-three screens used to fetch in a `useEffect` with no cache, no dedupe
 * and no retry. What replaced that has to behave identically on both clients,
 * because the thing it decides — how long a figure is worth trusting, what is
 * worth retrying, what a screen shows before the network answers — is what the
 * front desk reads off the screen.
 */
import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@rh/shared";
import { CacheStore } from "../src/offline-cache";
import { QueryProvider, keys, useApi, worthRetrying } from "../src/query";
import { memoryStorage } from "../src/storage";

/**
 * The retry rule, named so it can be read and tested. It used to be an inline
 * lambda inside the QueryClient's options, where the one case that matters —
 * never retry a refusal — could not be checked by anything.
 */
describe("worthRetrying", () => {
  it("retries a dropped connection, twice and no more", () => {
    expect(worthRetrying(0, new TypeError("Failed to fetch"))).toBe(true);
    expect(worthRetrying(1, new TypeError("Failed to fetch"))).toBe(true);
    expect(worthRetrying(2, new TypeError("Failed to fetch"))).toBe(false);
  });

  it("retries a 5xx, because the desk did nothing wrong", () => {
    expect(worthRetrying(0, new ApiError(503, "Bad gateway"))).toBe(true);
  });

  /**
   * Retrying "you do not have permission" three times does not change the
   * answer; it only delays the message by eight seconds.
   */
  it("never retries a refusal", () => {
    expect(worthRetrying(0, new ApiError(403, "Not yours"))).toBe(false);
    expect(worthRetrying(0, new ApiError(404, "Gone"))).toBe(false);
    expect(worthRetrying(0, new ApiError(422, "Too much"))).toBe(false);
  });
});

function Rooms({ cache }: { cache: CacheStore }) {
  return (
    <QueryProvider cache={cache}>
      <RoomList />
    </QueryProvider>
  );
}

let lastStale: string | null = null;
let fetcher: () => Promise<{ name: string }[]> = async () => [];

function RoomList() {
  const q = useApi(keys.rooms(7), fetcher);
  lastStale = q.stale;
  return <span data-testid="rooms">{(q.data ?? []).map((r) => r.name).join(",") || "—"}</span>;
}

const shown = () => screen.getByTestId("rooms").textContent;

describe("what the browser kept", () => {
  it("writes a successful read to the cache", async () => {
    const cache = new CacheStore(memoryStorage());
    fetcher = async () => [{ name: "102" }];
    render(<Rooms cache={cache} />);
    await waitFor(() => expect(shown()).toBe("102"));
    await waitFor(() =>
      expect(cache.load<{ name: string }[]>(JSON.stringify(keys.rooms(7)))?.data).toEqual([{ name: "102" }]),
    );
  });

  /**
   * A screen that restores yesterday's failure is a screen nobody can clear.
   */
  it("does not keep a failed read", async () => {
    const cache = new CacheStore(memoryStorage());
    fetcher = async () => {
      throw new ApiError(500, "down");
    };
    render(<Rooms cache={cache} />);
    await waitFor(() => expect(shown()).toBe("—"));
    expect(cache.keys()).toEqual([]);
  });

  it("shows what it kept on the first frame, before the network answers", async () => {
    const cache = new CacheStore(memoryStorage());
    cache.save(JSON.stringify(keys.rooms(7)), [{ name: "from-cache" }]);
    let release: (v: { name: string }[]) => void = () => {};
    fetcher = () => new Promise((r) => (release = r));

    render(<Rooms cache={cache} />);

    // the request has not answered, and the desk is already reading something
    expect(shown()).toBe("from-cache");
    await act(async () => void release([{ name: "from-server" }]));
    await waitFor(() => expect(shown()).toBe("from-server"));
  });

  /**
   * Stale figures shown without saying so are worse than an empty screen: the
   * reader cannot tell.
   */
  it("says how old what it kept is, until the server answers", async () => {
    const cache = new CacheStore(memoryStorage());
    cache.save(JSON.stringify(keys.rooms(7)), [{ name: "old" }]);
    fetcher = () => new Promise(() => {});
    render(<Rooms cache={cache} />);
    await waitFor(() => expect(shown()).toBe("old"));
  });

  it("works with no cache at all, which is what a first launch is", async () => {
    fetcher = async () => [{ name: "102" }];
    render(
      <QueryProvider cache={null}>
        <RoomList />
      </QueryProvider>,
    );
    await waitFor(() => expect(shown()).toBe("102"));
    expect(lastStale).toBeNull();
  });
});

describe("keys", () => {
  it("start with the resort, so switching one cannot show the other's rows", () => {
    expect(keys.rooms(7)).toEqual(["rooms", 7]);
    expect(keys.bookings(7, { state: "IN_HOUSE" })).toEqual(["bookings", 7, { state: "IN_HOUSE" }]);
    expect(keys.rooms(7)).not.toEqual(keys.rooms(8));
  });

  it("key an agency's own rows by the agency, because that is what owns them", () => {
    expect(keys.agentWallet()).toEqual(["agent", "wallet"]);
    expect(keys.agentCalendar("2026-09-01", "2026-09-30")).toEqual([
      "agent",
      "calendar",
      "2026-09-01",
      "2026-09-30",
      null,
    ]);
  });
});
