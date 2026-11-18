import globals from 'globals';
import { baseConfigs, reactHooks, sharedTsRules, tseslint } from '../../eslint.base.mjs';

export default tseslint.config(
  { ignores: ['node_modules/**', '.expo/**', 'ios/**', 'android/**', 'coverage/**', '*.js', 'plugins/**'] },
  ...baseConfigs,
  { files: ['**/*.mjs'], languageOptions: { globals: globals.node } },
  { files: ['config/**/*.cjs'], languageOptions: { globals: globals.node }, rules: { '@typescript-eslint/no-require-imports': 'off' } },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
    plugins: { 'react-hooks': reactHooks },
    rules: sharedTsRules,
  },
);
