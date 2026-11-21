import { baseConfigs, reactHooks, sharedTsRules, tseslint } from '../../eslint.base.mjs';

export default tseslint.config(
  { ignores: ['node_modules/**'] },
  ...baseConfigs,
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: { setInterval: 'readonly', clearInterval: 'readonly' } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...sharedTsRules,
      'no-restricted-imports': ['error', { patterns: [{ group: ['react-dom', 'react-native', 'electron'], message: 'shared hooks must not choose a rendering platform' }] }],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'navigator'],
    },
  },
);
