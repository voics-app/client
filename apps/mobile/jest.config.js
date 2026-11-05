module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/**/*.test.{ts,tsx}'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  // The first router render transforms the whole expo-router tree; cold CI runners need more than 5 s.
  // Reanimated and worklets run their JavaScript implementations under Jest instead of the native runtime.
  resolver: require.resolve('react-native-reanimated/jest/resolver'),
  testTimeout: 60000,
};
