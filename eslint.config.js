import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'frontend/dist/**', '.test-dist/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser }, parserOptions: { ecmaVersion: 'latest', sourceType: 'module' } },
    rules: { '@typescript-eslint/no-explicit-any': 'error' }
  },
  {
    files: ['frontend/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/incompatible-library': 'warn' },
  },
  {
    files: ['infra/docker/mongo-init-replica.js'],
    languageOptions: { globals: { ...globals.mongo, sleep: 'readonly' } }
  },
  {
    files: ['tests/load/**/*.js'],
    languageOptions: { globals: { __ENV: 'readonly', __VU: 'readonly', __ITER: 'readonly' } }
  }
);
