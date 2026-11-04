import globals from 'globals';
import { baseConfigs, reactHooks, sharedTsRules, tseslint } from '../../eslint.base.mjs';

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'release/**', 'node_modules/**', 'test-results/**', 'stage/**', 'electron-builder.config.cjs'] },
  ...baseConfigs,
  // Plain Node diagnostic scripts (e.g. tests/live/attach-watch.mjs).
  { files: ['**/*.mjs'], languageOptions: { globals: globals.node } },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...sharedTsRules,
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-dom', 'zustand', 'electron'], message: 'domain must stay framework-free' },
          ],
        },
      ],
    },
  },
  {
    // Ports keep domain and application portable (packages/core, apps/mobile): no browser globals there.
    files: ['src/renderer/domain/**', 'src/renderer/application/**'],
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'location'],
      'no-restricted-properties': ['error', { object: 'globalThis', property: 'localStorage' }, { object: 'globalThis', property: 'window' }, { object: 'globalThis', property: 'document' }],
    },
  },
  {
    files: ['src/renderer/application/**', 'src/renderer/infrastructure/**', 'src/renderer/interface/**', 'src/renderer/*.tsx', 'src/renderer/*.ts', 'src/main/**', 'src/preload/**', 'tests/**', '*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
);
