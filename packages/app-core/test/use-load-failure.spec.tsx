/**
 * Somewhere to put the error, on both clients.
 *
 * Fourteen console screens wrote `.catch(() => setRows([]))`, which turns an
 * expired token, a 403 or a database that is down into a cheerful "nothing
 * here" — a manager whose session had lapsed read "No team members yet" on a
 * resort with twenty staff. The phone will have the same fourteen screens and
 * would otherwise invent the same mistake independently.
 *
 * Only the hook moves. `LoadFailed` renders `<ErrorState>`, which is Tailwind
 * and `<div>`s, and stays in the console; the app will render the same failure
 * with a native component and the same hook underneath it.
 */
import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useLoadFailure } from "../src/use-load-failure";

let latest: ReturnType<typeof useLoadFailure>;

function Screen() {
  latest = useLoadFailure();
  return <span data-testid="error">{latest.error?.message ?? "none"}</span>;
}

const shown = () => screen.getByTestId("error").textContent;

describe("useLoadFailure", () => {
  it("starts with nothing wrong", () => {
    render(<Screen />);
    expect(shown()).toBe("none");
  });

  it("records the failure a rejected load hands it", () => {
    render(<Screen />);
    act(() => latest.onFail()(new Error("Your session has expired")));
    expect(shown()).toBe("Your session has expired");
  });

  it("keeps a thrown non-Error readable instead of rendering 'undefined'", () => {
    render(<Screen />);
    // an API client that rejects with a string, or a 403 body, or nothing
    act(() => latest.onFail()("403"));
    expect(shown()).toBe("Could not load this");
  });

  it("still runs the caller's fallback, so a list can empty itself", () => {
    const emptyTheList = vi.fn();
    render(<Screen />);
    act(() => latest.onFail(emptyTheList)(new Error("down")));
    expect(emptyTheList).toHaveBeenCalledTimes(1);
    // and the error is recorded as well as the fallback run: that is the point
    expect(shown()).toBe("down");
  });

  it("clears, so a successful retry stops showing yesterday's failure", () => {
    render(<Screen />);
    act(() => latest.onFail()(new Error("down")));
    act(() => latest.clear());
    expect(shown()).toBe("none");
  });
});
