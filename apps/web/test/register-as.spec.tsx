/**
 * "Register as" — the question the signup pages never asked out loud.
 *
 * The platform sells to two customers and had a front door for each, joined by
 * one line of small grey text: "A travel agency? Sign up as an agency." So the
 * resort form was the default and the agency form was a thing you found. A
 * travel agency arriving at /signup read "Company / group name" and "First
 * resort name" and had no reason to think it was on the wrong page — the two
 * customers are not variations of each other, and which one you are is the
 * first thing the form should establish.
 *
 * It is a choice rather than an extra step: the page you are on answers it
 * already, so the control shows the answer and offers the other one.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RegisterAs } from "@/components/register-as";

describe("the register-as choice", () => {
  it("names both customers the platform sells to", () => {
    render(<RegisterAs current="resort" />);
    expect(screen.getByText(/resort owner/i)).toBeTruthy();
    expect(screen.getByText(/travel agency/i)).toBeTruthy();
  });

  it("marks the one whose form you are on", () => {
    const { container } = render(<RegisterAs current="resort" />);
    const chosen = container.querySelector('[aria-current="true"]');
    expect(chosen?.textContent).toMatch(/resort owner/i);
  });

  it("sends a travel agency to the agency form", () => {
    render(<RegisterAs current="resort" />);
    const link = screen.getByText(/travel agency/i).closest("a");
    expect(link?.getAttribute("href")).toBe("/signup/agency");
  });

  it("sends a resort owner back to the resort form", () => {
    render(<RegisterAs current="agency" />);
    const link = screen.getByText(/resort owner/i).closest("a");
    expect(link?.getAttribute("href")).toBe("/signup");
  });

  it("does not offer a link to the form already open", () => {
    render(<RegisterAs current="agency" />);
    expect(screen.getByText(/travel agency/i).closest("a")).toBeNull();
  });

  it("carries an offer code across to the other form", () => {
    // an invitation is for a person, not for a form; losing the code because
    // they corrected which kind of business they run would cost them the offer
    render(<RegisterAs current="resort" search="?offer=SPRING24" />);
    expect(screen.getByText(/travel agency/i).closest("a")?.getAttribute("href")).toBe(
      "/signup/agency?offer=SPRING24",
    );
  });
});
