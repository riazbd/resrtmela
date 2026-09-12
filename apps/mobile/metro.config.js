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
 */

module.exports = config;
