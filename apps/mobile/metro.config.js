// Expo configures the pnpm/npm workspace (watchFolders, node_modules lookup) automatically.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
