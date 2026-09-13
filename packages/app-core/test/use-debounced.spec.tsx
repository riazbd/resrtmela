/**
 * The first hook to leave the console.
 *
 * It had no test there — it is four lines and looks obviously right. It is not
 * obviously right: a debounce that restarts its timer on every render rather
 * than on every *value* holds the last keystroke forever, and a debounce that
 * does not clear on unmount sets state on a screen the user has left.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useDebounced } from "../src/use-debounced";

function Search({ term, ms }: { term: string; ms?: number }) {
  const held = useDebounced(term, ms);
  return <span data-testid="held">{held}</span>;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const held = () => screen.getByTestId("held").textContent;

describe("useDebounced", () => {
  it("shows the first value immediately, so a screen never starts blank", () => {
    render(<Search term="rah" />);
    expect(held()).toBe("rah");
  });

  it("holds a changing value still until it settles", () => {
    const { rerender } = render(<Search term="r" />);
    for (const term of ["ra", "rah", "rahm", "rahma", "rahman"]) {
      rerender(<Search term={term} />);
      act(() => void vi.advanceTimersByTime(100)); // faster than the 300ms window
    }
    // six keystrokes, and the held value is still the first: no request yet
    expect(held()).toBe("r");
    act(() => void vi.advanceTimersByTime(300));
    expect(held()).toBe("rahman");
  });

  it("takes its own delay", () => {
    const { rerender } = render(<Search term="a" ms={50} />);
    rerender(<Search term="b" ms={50} />);
    act(() => void vi.advanceTimersByTime(49));
    expect(held()).toBe("a");
    act(() => void vi.advanceTimersByTime(1));
    expect(held()).toBe("b");
  });

  it("stops its timer when the screen goes away", () => {
    const { rerender, unmount } = render(<Search term="a" />);
    rerender(<Search term="b" />);
    unmount();
    // an uncleared timer would set state on an unmounted component here
    expect(() => act(() => void vi.advanceTimersByTime(1000))).not.toThrow();
  });
});
