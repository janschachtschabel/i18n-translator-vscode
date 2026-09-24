import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/', 'out/', 'coverage/', '.vscode-test/', 'node_modules/', 'test/fixtures/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
  {
    // Layer rule: the core stays platform-neutral so it can be unit-tested and reused (CLI, CI).
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'vscode', message: 'src/core must not depend on the VS Code API.' }],
          patterns: [
            { group: ['**/extension/**', '**/webview/**'], message: 'src/core must not depend on outer layers.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator'],
    },
  },
);
