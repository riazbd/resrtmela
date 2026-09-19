/**
 * Metro, taught about the monorepo.
 *
 * The default config looks for modules beside the app. Here they are two
 * levels up as well, because pnpm keeps the store at the workspace root and
 * symlinks into it — without `watchFolders` a change in a shared package is
 * invisible, and without the explicit `nodeModulesPaths` a hoisted dependency
 * resolves to nothing at bundle time and the app dies on a red screen that
 * names a file nobody edited.
 */
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

/**
 * `disableHierarchicalLookup` is the usual advice for monorepos and is wrong
 * here. It is meant for npm and yarn, where hoisting means a package found by
 * walking up the tree is a duplicate. pnpm is the opposite: a package's own
 * dependencies live in a `node_modules` beside it inside the store, and
 * walking up is the only way to reach them. Switching it on cost a build —
 * `expo` could not resolve `expo-modules-core`, its own dependency.
 *
 * But that same walking-up is how two Reacts get into one bundle. `@rh/app-
 * core` declares React a peer and keeps its own copy to run its vitest suite
 * against; the console is on 19.2.8 and this app is pinned to the 19.2.3 that
 * Expo SDK 57 ships, so those are genuinely different files in the store.
 * Metro, resolving `react` from inside `packages/app-core/src`, finds
 * app-core's before it finds the app's.
 *
 * Two Reacts do not merely duplicate code. The dispatcher a hook reads lives
 * on each copy's own internals object, so every hook in `AuthProvider`,
 * `QueryProvider` and `OutboxProvider` would look for a renderer that had
 * registered itself with the *other* copy and find nothing — the app's whole
 * session layer, failing on `useState`. The mobile jest suite is where it
 * first showed.
 *
 * So React is pinned to the app's copy for everything this bundle contains.
 * `apps/mobile/jest.config.js` maps the same three names for the same reason,
 * and the two lists have to stay in step.
 */
const oneReact = {
  react: "react",
  "react-dom": "react-dom",
  "react/jsx-runtime": "react/jsx-runtime",
  "react/jsx-dev-runtime": "react/jsx-dev-runtime",
};

/** Resolved from the app, not from whichever package happened to ask. */
const fromTheApp = (name) =>
  require.resolve(name, { paths: [path.resolve(projectRoot, "node_modules")] });

const inherited = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (Object.prototype.hasOwnProperty.call(oneReact, moduleName)) {
    return { type: "sourceFile", filePath: fromTheApp(oneReact[moduleName]) };
  }
  return (inherited ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
