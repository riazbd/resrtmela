"use client";

import { useEffect, useState } from "react";

/**
 * Holds a value still until it stops changing.
 *
 * Search boxes fired a request per keystroke: typing "rahman" was six queries
 * of which only the last was an answer anybody wanted. On a hill-district
 * connection those six queue up behind each other and the results arrive out
 * of order, so the list can settle on the wrong one.
 */
export function useDebounced<T>(value: T, ms = 300): T {
  const [held, setHeld] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setHeld(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return held;
}
