module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/**/*.test.{ts,tsx}'],
  // The first router render transforms the whole expo-router tree; cold CI runners need more than 5 s.
  testTimeout: 60000,
};
