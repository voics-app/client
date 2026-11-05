module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/**/*.test.{ts,tsx}'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  // The first router render transforms the whole expo-router tree; cold CI runners need more than 5 s.
  // Reanimated and worklets run their JavaScript implementations under Jest instead of the native runtime.
  resolver: require.resolve('react-native-reanimated/jest/resolver'),
  // The first test of a suite loads the whole router. CI runners share one VM, so limit the workers and allow more time there.
  testTimeout: process.env.CI ? 180000 : 60000,
  ...(process.env.CI ? { maxWorkers: 2 } : {}),
};
