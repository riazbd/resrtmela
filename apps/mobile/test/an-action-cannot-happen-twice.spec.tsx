/**
 * The latch that stops one tap becoming two bookings.
 *
 * `Button` already refuses while its `loading` prop is true, and that covers
 * the slow case. It does not cover the fast one: `setBusy(true)` only
 * schedules a render, so two taps inside the same frame both read the old
 * props and both get through. This is the ref that is true the instant the
 * first tap is handled.
 *
 * Every `act` here is asynchronous and awaited, and every promise settles
 * inside the act that started it. That is not style. A *synchronous* `act`
 * that leaves a promise pending poisons the renderer for the rest of the
 * file — proved on a bare `<Text>hi</Text>`: renders before it are fine, the
 * one after it draws nothing at all and the failure talks about a missing
 * element. `test/the-harness-can-draw-a-screen.spec.tsx` pins the rule.
 */
import { render, act } from "@testing-library/react-native";
import { Text } from "react-native";
import { useAction, type Action } from "../src/design/use-action";

/** A promise this test decides when to settle. */
function deferred<T>() {
  let settle!: (value: T) => void;
  let fail!: (reason: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  // nothing reaches the runtime's unhandled-rejection handler before the
  // hook has attached its own catch
  promise.catch(() => {});
  return { promise, settle, fail };
}

let action: Action;
/** Every state the host has been drawn in, in order. */
let drawn: string[] = [];

function Host({ run }: { run: () => Promise<unknown> }) {
  action = useAction(run);
  drawn.push(action.busy ? "working" : "idle");
  return <Text>{action.busy ? "working" : "idle"}</Text>;
}

const mount = (run: () => Promise<unknown>) => {
  drawn = [];
  return render(<Host run={run} />);
};

describe("an action already in flight", () => {
  it("runs once however many times it is set off", async () => {
    const d = deferred<void>();
    const run = jest.fn(() => d.promise);
    await mount(run);

    await act(async () => {
      // three taps in one frame, which is the case a `busy` flag in state
      // cannot catch: no render has happened between them
      action.go();
      action.go();
      action.go();
      d.settle();
    });

    expect(run).toHaveBeenCalledTimes(1);
  });

  /**
   * Read off the renders rather than caught mid-flight. Holding a promise
   * open across an `act` is the very thing that breaks this harness, so the
   * host records each state it is drawn in and the test reads the sequence
   * afterwards.
   */
  it("says it is busy while it runs, so the button can show it", async () => {
    const d = deferred<void>();
    const r = await mount(() => d.promise);
    expect(drawn).toEqual(["idle"]);

    // two acts, not one: inside a single act React batches both state
    // changes and commits once, so the busy render never happens — which is
    // also true of a request that answers instantly, and is why the button
    // does not flicker on a fast connection
    await act(async () => {
      action.go();
    });
    expect(drawn).toEqual(["idle", "working"]);
    expect(r.getByText("working")).toBeTruthy();

    await act(async () => {
      d.settle();
    });
    expect(drawn).toEqual(["idle", "working", "idle"]);
    expect(r.getByText("idle")).toBeTruthy();
  });
});

describe("after it has finished", () => {
  it("can be set off again", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const run = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    await mount(run);

    await act(async () => {
      action.go();
      first.settle();
    });
    await act(async () => {
      action.go();
      second.settle();
    });

    expect(run).toHaveBeenCalledTimes(2);
  });

  /**
   * A refusal is the commonest reason to try again — a wrong password, a
   * room that has just gone. A latch that stuck on failure would leave the
   * button dead with nothing on screen explaining why.
   */
  it("can be set off again after it failed", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const run = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const r = await mount(run);

    await act(async () => {
      action.go();
      first.fail(new Error("Wrong phone or password"));
    });
    expect(r.getByText("idle")).toBeTruthy();

    await act(async () => {
      action.go();
      second.settle();
    });
    expect(run).toHaveBeenCalledTimes(2);
  });

  /**
   * A `run` that throws before it returns a promise — a screen reading a
   * field off something undefined — must not leave the button latched dead.
   */
  it("releases when the work throws before it even starts", async () => {
    const run = jest.fn(() => {
      throw new Error("read of undefined");
    });
    const r = await mount(run as unknown as () => Promise<unknown>);

    await act(async () => {
      action.go();
    });
    expect(r.getByText("idle")).toBeTruthy();

    await act(async () => {
      action.go();
    });
    expect(run).toHaveBeenCalledTimes(2);
  });
});
