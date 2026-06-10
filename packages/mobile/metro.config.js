const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const defaultConfig = getDefaultConfig(projectRoot);

/**
 * Metro configuration for @tan/mobile.
 * Watches the workspace root so that @tan/shared changes are picked up live.
 */
const config = {
  watchFolders: [workspaceRoot],

  resolver: {
    // Allow Metro to resolve workspace packages
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    // Map @tan/shared to the local source (avoids needing a build step during development)
    extraNodeModules: {
      '@tan/shared': path.resolve(workspaceRoot, 'packages/shared/src'),
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);
