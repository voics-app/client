import globals from 'globals';
import { baseConfigs, reactHooks, sharedTsRules, tseslint } from '../../eslint.base.mjs';

export default tseslint.config(
  { ignores: ['node_modules/**', 'coverage/**'] },
  ...baseConfigs,
  {
    files: ['**/*.ts'],
    languageOptions: { globals: globals.node },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...sharedTsRules,
      // Core runs on desktop and mobile: no UI framework, no Electron, no browser globals.
      'no-restricted-imports': ['error', { patterns: [{ group: ['react', 'react-dom', 'react-native', 'electron'], message: 'core must stay framework-free' }] }],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'location'],
    },
  },
  {
    // Stores are zustand state containers; the domain stays free of any state library.
    files: ['src/domain/**/*.ts', 'src/contracts/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['react', 'react-dom', 'react-native', 'zustand', 'electron'], message: 'domain and contracts must stay framework-free' }] }],
    },
  },
);
