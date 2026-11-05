import globals from 'globals';
import { baseConfigs, reactHooks, sharedTsRules, tseslint } from '../../eslint.base.mjs';

export default tseslint.config(
  { ignores: ['node_modules/**', '.expo/**', 'ios/**', 'android/**', 'coverage/**', '*.js'] },
  ...baseConfigs,
  { files: ['**/*.mjs'], languageOptions: { globals: globals.node } },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
    plugins: { 'react-hooks': reactHooks },
    rules: sharedTsRules,
  },
);
