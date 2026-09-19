/**
 * Why this package runs jest while the rest of the repo runs vitest.
 *
 * It was tried the other way first, because one runner is worth having. It
 * does not work: vitest parses with rolldown, and `import { View } from
 * "react-native"` fails on the first line of react-native's own index.js —
 * that source ships Flow types, not TypeScript. Teaching vitest to read it
 * means a Babel transform for react-native and for every Expo module the app
 * imports, and then hand-written mocks for each native module behind them,
 * because there is no device under a unit test. That is roughly forty mocks
 * which Expo already writes and maintains.
 *
 * `jest-expo` is that transform and those mocks. `@testing-library/react-
 * native` and `expo-router/testing-library` are built on it. So this one
 * package uses it, and the phase-0 plan's preference for a "jest-expo-free
 * vitest setup" is recorded as tried and wrong rather than quietly dropped.
 *
 * Nothing else changes: `@rh/shared` and `@rh/app-core` keep their vitest
 * suites, and the rules those packages hold are tested there, once.
 */

/**
 * Packages shipped as source rather than as compiled JavaScript, so Babel has
 * to see them.
 *
 * The pattern has to be written for pnpm, and the usual one is not. Every
 * dependency sits behind a mangled store path —
 * `node_modules/.pnpm/@react-native_6yrcovmf…/node_modules/@react-native/…`
 * — so `node_modules/(?!@react-native/)` never matches it, react-native's own
 * jest preset arrives untransformed, and the run dies on the `import` in its
 * first line.
 *
 * The question therefore has to be "does this path contain one of these
 * package directories anywhere", not "does it begin with one". A negative
 * lookahead over the rest of the path asks that, and the separator class
 * covers Windows.
 */
const shippedAsSource = [
  "react-native[^\\\\/]*",
  "@react-native[^\\\\/]*",
  "expo[^\\\\/]*",
  "@expo[^\\\\/]*",
  "@react-navigation[^\\\\/]*",
  "@rh",
  "@testing-library",
].join("|");

/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
  testMatch: ["<rootDir>/test/**/*.spec.{ts,tsx}"],
  transformIgnorePatterns: [
    `node_modules[\\\\/](?!(.*[\\\\/])?(${shippedAsSource})[\\\\/])`,
  ],
  /**
   * One React, for the same reason `metro.config.js` pins one.
   *
   * `@rh/app-core` keeps its own React to run its vitest suite against — the
   * console's 19.2.8 — while this app is pinned to the 19.2.3 Expo SDK 57
   * ships. Resolving `react` from inside `packages/app-core/src` finds
   * app-core's copy first, and a hook called from there reads a dispatcher
   * that the renderer never registered with: `QueryProvider` dies on
   * `useState` before a single screen draws. Keep this list and the one in
   * `metro.config.js` in step.
   */
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^react$": "<rootDir>/node_modules/react",
    "^react-dom$": "<rootDir>/node_modules/react-dom",
    "^react/(.*)$": "<rootDir>/node_modules/react/$1",
  },
  /**
   * A screen that renders nothing still passes a test that only mounts it, so
   * coverage is collected from the start rather than bolted on once the app
   * is large enough for the number to be embarrassing.
   */
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/**/*.d.ts"],
  clearMocks: true,
};
