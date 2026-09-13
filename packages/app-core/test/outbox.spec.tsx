/**
 * The outbox, wired to whichever app is running it.
 *
 * The logic here is the part a resort's money depends on: try the network, and
 * when the network is the problem queue instead of failing — but only for a
 * write that can be replayed. An edit that quietly overwrote somebody else's
 * change would be worse than a refusal, so an edit gets the refusal.
 *
 * Three things could not travel with it, and each became a prop: knowing
 * whether there is a network (`navigator.onLine` in a browser, NetInfo on a
 * phone), telling a person something failed (`window.alert` versus `Alert`),
 * and the call itself.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@rh/shared";
import { OfflineQueue } from "../src/offline-queue";
import { OutboxProvider, useOutbox } from "../src/outbox";
import { memoryStorage } from "../src/storage";

const payment = {
  kind: "payment" as const,
  label: "Collect ৳3,000 for BK-00042",
  path: "/payments",
  body: { amount: 3000 },
};
const edit = { ...payment, kind: "edit" as const, label: "Rename room 102" };

let outbox: ReturnType<typeof useOutbox>;

function Probe() {
  outbox = useOutbox();
  return <span data-testid="pending">{outbox.pending.length}</span>;
}

function mount(props: Partial<React.ComponentProps<typeof OutboxProvider>> = {}) {
  const listeners: ((online: boolean) => void)[] = [];
  const announced: { label: string; reason: string }[] = [];
  const send = props.send ?? vi.fn(async () => ({}));
  const queue = props.queue ?? new OfflineQueue(send as never, memoryStorage());
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <OutboxProvider
        queue={queue}
        send={send}
        watchOnline={(cb) => {
          listeners.push(cb);
          cb(true);
          return () => void listeners.splice(listeners.indexOf(cb), 1);
        }}
        announceRejected={(label, reason) => void announced.push({ label, reason })}
        {...props}
      >
        <Probe />
      </OutboxProvider>
    </QueryClientProvider>,
  );
  return { queue, announced, goOffline: () => listeners.forEach((l) => l(false)), goOnline: () => listeners.forEach((l) => l(true)) };
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe("submitting through the outbox", () => {
  it("sends straight through when the network is there", async () => {
    const send = vi.fn(async () => ({}));
    const { queue } = mount({ send });
    await act(async () => {
      await expect(outbox.submit(payment)).resolves.toEqual({ queued: false });
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(queue.pending()).toEqual([]);
  });

  it("queues a replayable write when the network is the problem", async () => {
    const send = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { queue } = mount({ send });
    await act(async () => {
      await expect(outbox.submit(payment)).resolves.toEqual({ queued: true });
    });
    expect(queue.pending().map((w) => w.label)).toEqual([payment.label]);
    expect(screen.getByTestId("pending").textContent).toBe("1");
  });

  /**
   * The refusal that is better than the alternative. Saying "saved" and then
   * quietly losing the change is the failure this avoids.
   */
  it("refuses an edit rather than queueing one, and says why", async () => {
    const send = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { queue } = mount({ send });
    await act(async () => {
      await expect(outbox.submit(edit)).rejects.toThrow(/needs a connection/i);
    });
    expect(queue.pending()).toEqual([]);
  });

  it("lets a refusal from the server through, instead of hiding it in a queue", async () => {
    const send = vi.fn(async () => {
      throw new ApiError(422, "A payment cannot exceed the balance due");
    });
    const { queue } = mount({ send });
    await act(async () => {
      await expect(outbox.submit(payment)).rejects.toThrow(/exceed the balance/);
    });
    expect(queue.pending()).toEqual([]);
  });
});

describe("when the connection comes back", () => {
  it("flushes what was waiting", async () => {
    let up = false;
    const send = vi.fn(async () => {
      if (!up) throw new TypeError("Failed to fetch");
      return {};
    });
    const { queue, goOnline } = mount({ send });
    await act(async () => void (await outbox.submit(payment)));
    expect(queue.pending()).toHaveLength(1);

    up = true;
    await act(async () => void goOnline());

    await waitFor(() => expect(queue.pending()).toHaveLength(0));
  });

  /**
   * The browser's online event is optimistic — it fires when an interface comes
   * up, not when the API is reachable — and a phone's is no better. So there is
   * also a timer, and it is the thing that actually rescues a desk whose router
   * rebooted.
   */
  it("keeps retrying on a timer while anything is still waiting", async () => {
    let up = false;
    const send = vi.fn(async () => {
      if (!up) throw new TypeError("Failed to fetch");
      return {};
    });
    const { queue } = mount({ send });
    await act(async () => void (await outbox.submit(payment)));

    up = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    await waitFor(() => expect(queue.pending()).toHaveLength(0));
  });

  it("tells a person about a write the server refused on replay, never swallows it", async () => {
    let refuse = false;
    const send = vi.fn(async () => {
      if (!refuse) throw new TypeError("Failed to fetch");
      throw new ApiError(422, "That booking is already paid");
    });
    const { queue, announced, goOnline } = mount({ send });
    await act(async () => void (await outbox.submit(payment)));

    refuse = true;
    await act(async () => void goOnline());

    await waitFor(() => expect(announced).toHaveLength(1));
    expect(announced[0]).toEqual({ label: payment.label, reason: "That booking is already paid" });
    expect(queue.pending()).toEqual([]);
  });
});

describe("the outbox's own state", () => {
  it("reports the connection as the host describes it", async () => {
    const { goOffline } = mount();
    expect(outbox.online).toBe(true);
    await act(async () => void goOffline());
    expect(outbox.online).toBe(false);
  });

  it("discards a queued write on request", async () => {
    const send = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { queue } = mount({ send });
    await act(async () => void (await outbox.submit(payment)));
    const id = queue.pending()[0]!.id;
    act(() => outbox.discard(id));
    expect(queue.pending()).toEqual([]);
    expect(screen.getByTestId("pending").textContent).toBe("0");
  });

  it("refuses to be used outside its provider, rather than failing later and elsewhere", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => render(<Probe />)).toThrow(/OutboxProvider/);
    } finally {
      quiet.mockRestore();
    }
  });
});
