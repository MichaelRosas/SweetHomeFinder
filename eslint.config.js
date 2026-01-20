import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default defineConfig([
  // Ignore build/artifacts and the config file itself
  globalIgnores(['dist', 'node_modules', 'coverage', 'eslint.config.js']),

  js.configs.recommended,
  reactHooks.configs['recommended-latest'],
  reactRefresh.configs.vite,

  ...compat.extends('plugin:jsx-a11y/recommended', 'prettier'),

  // Project rules for JS/JSX
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      ...(process.env.NODE_ENV === 'production'
        ? { 'no-console': ['warn', { allow: ['warn', 'error'] }] }
        : {}),
    },
  },
]);
