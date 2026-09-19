/**
 * Something a person sets off, that cannot be set off twice.
 *
 * Every screen has at least one: sign in, take payment, check in, save. All
 * of them are one tap away from being done twice, and a booking taken twice
 * is the failure this whole product is built to make impossible.
 *
 * A `busy` flag in state is not enough on its own. `setBusy(true)` schedules
 * a render; two taps inside the same frame both read the old props, and both
 * get through. The latch is therefore a ref, which is true the instant the
 * first tap is handled — the state is only there so the button can *show*
 * it.
 */
import { useCallback, useRef, useState } from "react";

export interface Action {
  /** Safe to call from `onPress` directly; it returns nothing and throws nothing. */
  go: () => void;
  /** For `Button`'s `loading`. */
  busy: boolean;
}

/**
 * `run` may reject: the caller is expected to have caught what it wants to
 * show, and anything left is swallowed here rather than becoming an unhandled
 * rejection that crashes a release build.
 */
export function useAction(run: () => Promise<unknown>): Action {
  const [busy, setBusy] = useState(false);
  const latched = useRef(false);

  const go = useCallback(() => {
    if (latched.current) return;
    latched.current = true;
    setBusy(true);

    const release = () => {
      latched.current = false;
      setBusy(false);
    };

    let running: Promise<unknown>;
    try {
      // called here and not inside a `.then`, so the request is on its way
      // in the same tick as the tap — a microtask's delay is long enough for
      // a second tap to arrive before the first has started anything
      running = Promise.resolve(run());
    } catch {
      release();
      return;
    }
    void running
      .catch(() => {
        /* the screen shows what it chose to show; this is the backstop */
      })
      .finally(release);
  }, [run]);

  return { go, busy };
}
