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
// pnpm gives each package its own tree; walking up past the two paths above
// finds the store's internal copies and can load a second React
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
