const expoPreset = require('jest-expo/jest-preset');

module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/**/*.test.{ts,tsx}'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  // Shared ICU messages use FormatJS's ESM packages; preserve Expo's native transform exceptions.
  transformIgnorePatterns: expoPreset.transformIgnorePatterns.map((pattern) => pattern.replace('/node_modules/', '/node_modules/(?!intl-messageformat/|@formatjs/)')),
  // The first router render transforms the whole expo-router tree; cold CI runners need more than 5 s.
  // Reanimated and worklets run their JavaScript implementations under Jest instead of the native runtime.
  resolver: require.resolve('react-native-reanimated/jest/resolver'),
  // The first test of a suite loads the whole router. CI runners share one VM, so limit the workers and allow more time there.
  testTimeout: process.env.CI ? 180000 : 60000,
  ...(process.env.CI ? { maxWorkers: 2 } : {}),
};
