/**
 * Take the previous test's DOM down before the next one goes up.
 *
 * `@testing-library/react` registers this itself when vitest runs with
 * `globals: true`. This package does not — the explicit imports are worth more
 * than the brevity — so the cleanup is registered here instead. Without it the
 * second render of a component finds two of everything, which is a confusing
 * way to be told about a missing line of configuration.
 */
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(cleanup);
