import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser }, parserOptions: { ecmaVersion: 'latest', sourceType: 'module' } },
    rules: { '@typescript-eslint/no-explicit-any': 'error' }
  }
);
