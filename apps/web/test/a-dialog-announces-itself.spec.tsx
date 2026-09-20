/**
 * A dialog says it is a dialog (2026-09-20).
 *
 * Found by driving the console with a browser automation tool, which
 * looked for `[role=dialog]` and found nothing — and what a tool cannot
 * find, a screen reader cannot announce.
 *
 * `Modal` is every form in this console: new booking, edit booking,
 * arrival, departure, new activity, add user, food package. Without a
 * role, opening one tells an assistive technology nothing has changed;
 * without a label it has no name to read out; and with focus left on
 * the button behind it, the next Tab walks the page underneath rather
 * than the form on top.
 *
 * The close button is the smallest of the four and the most visible:
 * its accessible name was "✕".
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Modal } from "@/components/ui";

const noop = () => {};

describe("a modal", () => {
  it("draws nothing when it is shut", () => {
    render(
      <Modal open={false} onClose={noop} title="New booking">
        <p>inside</p>
      </Modal>,
    );
    expect(screen.queryByText("inside")).toBeNull();
  });

  it("is a dialog, and one that blocks the page behind it", () => {
    render(
      <Modal open onClose={noop} title="New booking">
        <p>inside</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  /** Announced by its heading, which is the name a person would give it. */
  it("is named by its own title", () => {
    render(
      <Modal open onClose={noop} title="Check out BK-00009">
        <p>inside</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog", { name: "Check out BK-00009" })).toBeTruthy();
  });

  /** "✕" is not a name. */
  it("gives the close button words", () => {
    render(
      <Modal open onClose={noop} title="New booking">
        <p>inside</p>
      </Modal>,
    );
    expect(screen.getByRole("button", { name: /close/i })).toBeTruthy();
  });

  /**
   * Focus follows the dialog, or the next Tab walks the page underneath
   * — which is the page the dialog is covering.
   */
  it("takes focus when it opens", () => {
    render(
      <Modal open onClose={noop} title="New booking">
        <p>inside</p>
      </Modal>,
    );
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("closes on Escape, as it always has", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="New booking">
        <p>inside</p>
      </Modal>,
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalled();
  });
});
