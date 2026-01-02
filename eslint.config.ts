import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

const files = ['**/*.{js,mjs,cjs,ts,mts,cts}'];

export default defineConfig([
  { files, languageOptions: { globals: globals.browser } },
  tseslint.configs.recommended,
  {
    files,
    rules: {
      quotes: ['error', 'single', { avoidEscape: true }],
    },
  },
  eslintConfigPrettier,
]);
