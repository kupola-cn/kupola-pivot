import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['**/node_modules/**', '**/*.d.ts', '**/*.tgz', 'package-lock.json']
  },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error'
    }
  },
  {
    files: ['examples/**/*.{js,mjs}', 'test/**/*.{js,mjs}'],
    rules: {
      'no-unused-vars': 'off'
    }
  }
];
