// Shared ESLint rules for every app in the monorepo (apps/desktop and apps/mobile extend this).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export const sharedTsRules = {
  'react-hooks/rules-of-hooks': 'error',
  'react-hooks/exhaustive-deps': 'warn',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  '@typescript-eslint/consistent-type-imports': 'error',
};

export const baseConfigs = [js.configs.recommended, ...tseslint.configs.recommended];

export { reactHooks, tseslint };
